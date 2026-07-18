// extension/core/prompt-manager.js
//
// Injects the Runtime state contract into SillyTavern's prompt system.
// Uses SillyTavern.getContext() for eventSource/event_types (a global,
// no import path needed) and the global setExtensionPrompt function
// (confirmed available as a bare global on this ST version — see
// Extension-Summaryception for reference usage).

const INJECTION_KEY = "LWH_STATE";

export class PromptManager {
  constructor(runtime) {
    this.runtime = runtime;
  }

  init() {
    const { eventSource, event_types } = SillyTavern.getContext();

    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
      this._inject();
    });

    this._inject();
    console.log("[PromptManager] Initialized.");
  }

  _inject() {
    const contract = this.runtime.getContract();
    const block = `<state>\n${JSON.stringify(contract, null, 2)}\n</state>`;

    // setExtensionPrompt(key, value, position, depth, scan, role)
    // position 1 = IN_CHAT (matches Extension-Summaryception's usage)
    // depth 0 = as close to the latest message as possible
    setExtensionPrompt(INJECTION_KEY, block, 1, 0, false, 0);
  }

  debug() {
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(this.runtime.getContract(), null, 2));
  }
}
