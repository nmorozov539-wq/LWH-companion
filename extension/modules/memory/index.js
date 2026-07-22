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

      // Stub: detect whether an external summarizer is active.
      // Logged once at init so it's visible in the console during development.
      const external = _detectExternalSummarizer();
      if (external) {
        console.log("[Memory] External summarizer detected — summary processor will defer to it.");
      } else {
        console.log("[Memory] No external summarizer detected — summary processor will own compression when enabled.");
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
