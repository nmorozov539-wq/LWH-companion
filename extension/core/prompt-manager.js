// extension/core/prompt-manager.js
//
// Injects the Runtime state contract into SillyTavern's prompt system
// before every generation. Uses ST's own setExtensionPrompt API so
// injection position is handled by ST, not by us.

import { eventSource, event_types } from "../../script.js";
import { setExtensionPrompt, extension_prompt_types } from "../../scripts/extensions.js";

const INJECTION_KEY = "LWH_STATE";

export class PromptManager {
  constructor(runtime) {
    this.runtime = runtime;
  }

  init() {
    // Update the injected block before every generation.
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
      this._inject();
    });

    // Inject immediately so first generation is already covered.
    this._inject();

    console.log("[PromptManager] Initialized.");
  }

  _inject() {
    const contract = this.runtime.getContract();
    const block = `<state>\n${JSON.stringify(contract, null, 2)}\n</state>`;
    setExtensionPrompt(
      INJECTION_KEY,
      block,
      extension_prompt_types.BEFORE_PROMPT,
      0
    );
  }

  // Call this if you want to see what's currently being injected.
  debug() {
    const contract = this.runtime.getContract();
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(contract, null, 2));
  }
}
