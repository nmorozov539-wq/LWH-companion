// extension/core/prompt-manager.js
//
// Injects the Runtime state contract into SillyTavern's prompt system.
// Uses position 0 (IN_PROMPT) — merges into the system prompt directly,
// which is reliably supported across chat-completion and text-completion
// APIs. Position 1 (IN_CHAT) was tested and did not appear in the actual
// outgoing prompt for chat-completion backends.

const INJECTION_KEY = "LWH_STATE";

export class PromptManager {
  constructor(runtime) {
    this.runtime = runtime;
  }

  init() {
    const { eventSource, event_types } = SillyTavern.getContext();

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
    // position 0 = IN_PROMPT (merged into system prompt directly)
    setExtensionPrompt(INJECTION_KEY, block, 0, 0, false, 0);
  }

  debug() {
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(this.runtime.getContract(), null, 2));
  }
}
