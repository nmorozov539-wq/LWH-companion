// extension/modules/memory/index.js
//
// Flat key-value fact store. All facts are strings. The AI updates them by
// emitting a delta with the memory moduleId:
//
//   <lwh-delta>{"memory": {"current_location": "Vorhen Forest", "old_key": null}}</lwh-delta>
//
// A null value removes the fact entirely. Any other value is coerced to a string.
//
// External summarizer detection is stubbed here. When the summary processor
// module is built, it will check this flag to decide whether to run its own
// compression pipeline or defer to the external tool.

export default function memoryFactory(runtime) {
  return {
    init() {
      const existing = runtime.state.getOwnState("memory");
      // Only seed defaults on truly empty state — don't overwrite restored facts.
      if (!existing || Object.keys(existing).length === 0) {
        runtime.state.setState("memory", {});
      }

      // Compatibility check: LWH memory and external summarizers cannot run
      // together without causing drift — they produce parallel, unsynchronized
      // memory channels that will eventually contradict each other.
      // Design decision: users must choose one or the other.
      const external = _detectExternalSummarizer();
      if (external) {
        console.warn("[Memory] External summarizer detected. LWH Memory is incompatible with external summarizers — they will produce conflicting state over time. Deactivate one.");
        if (typeof toastr !== "undefined") {
          toastr.warning(
            "LWH Memory is active but an external summarizer was also detected. " +
            "These are incompatible — run /lwh_deactivate memory or disable your summarizer extension.",
            "LWH Companion — Conflict",
            { timeOut: 10000 }
          );
        }
      }
    },

    // delta shape: { "key": "value", "key_to_remove": null, ... }
    applyDelta(delta) {
      if (!delta || typeof delta !== "object") return;

      const current = { ...runtime.state.getOwnState("memory") };

      for (const [key, value] of Object.entries(delta)) {
        if (value === null || value === undefined) {
          delete current[key]; // explicit null = remove the fact
        } else {
          current[key] = String(value);
        }
      }

      // replaceState instead of setState so deletions actually take effect.
      runtime.state.replaceState("memory", current);
    },
  };
}

// Returns true if a known external summarizer extension is active.
// Expand this list as more summarizers are encountered in the wild.
function _detectExternalSummarizer() {
  try {
    const ctx = SillyTavern.getContext();
    const s = ctx?.extensionSettings;
    return !!(
      s?.summarize?.enabled ||       // Summaryscription
      s?.memory?.enabled ||          // generic "memory" extension
      s?.["summary-extension"]?.enabled
    );
  } catch {
    return false;
  }
}
