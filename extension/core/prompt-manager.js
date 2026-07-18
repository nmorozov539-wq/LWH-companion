// extension/core/prompt-manager.js
//
// Injects the Runtime state contract into SillyTavern's prompt system.
//
// IMPORTANT TIMING NOTE: setExtensionPrompt is a global provided by ST's
// core script.js, but it isn't available until ST finishes its own
// startup. If we call it too early (e.g. immediately at extension load),
// we get "setExtensionPrompt is not defined". So the first injection
// waits for event_types.APP_READY. After that, injections happen before
// every generation via GENERATE_BEFORE_COMBINE_PROMPTS.

const INJECTION_KEY = "LWH_STATE";

export class PromptManager {
  constructor(runtime) {
    this.runtime = runtime;
  }

  init() {
    const { eventSource, event_types } = SillyTavern.getContext();

    // Safe to register listeners immediately — registering just means
    // "call this later," it doesn't touch setExtensionPrompt yet.
    eventSource.on(event_types.APP_READY, () => {
      console.log("[PromptManager] APP_READY received, injecting for the first time.");
      this._inject();
    });

    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
      this._inject();
    });

    console.log("[PromptManager] Initialized, waiting for APP_READY.");
  }

  _inject() {
    const contract = this.runtime.getContract();
    const block = `<state>\n${JSON.stringify(contract, null, 2)}\n</state>`;

    // setExtensionPrompt(key, value, position, depth, scan, role)
    setExtensionPrompt(INJECTION_KEY, block, 1, 0, false, 0);
  }

  debug() {
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(this.runtime.getContract(), null, 2));
  }
}
