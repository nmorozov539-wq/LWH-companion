// extension/core/prompt-manager.js
//
// Receives ST's eventSource and setExtensionPrompt as constructor params
// so this file never needs to know ST's internal folder structure.

const INJECTION_KEY = "LWH_STATE";

export class PromptManager {
  constructor(runtime, { eventSource, event_types, setExtensionPrompt, extension_prompt_types }) {
    this.runtime = runtime;
    this.eventSource = eventSource;
    this.event_types = event_types;
    this.setExtensionPrompt = setExtensionPrompt;
    this.extension_prompt_types = extension_prompt_types;
  }

  init() {
    this.eventSource.on(this.event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
      this._inject();
    });
    this._inject();
    console.log("[PromptManager] Initialized.");
  }

  _inject() {
    const contract = this.runtime.getContract();
    const block = `<state>\n${JSON.stringify(contract, null, 2)}\n</state>`;
    this.setExtensionPrompt(
      INJECTION_KEY,
      block,
      this.extension_prompt_types.BEFORE_PROMPT,
      0
    );
  }

  debug() {
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(this.runtime.getContract(), null, 2));
  }
}
