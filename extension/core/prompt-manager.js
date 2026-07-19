// extension/core/prompt-manager.js
//
// Injects the Runtime state contract into SillyTavern's prompt system.
//
// setExtensionPrompt must come from SillyTavern.getContext() — it is not
// a bare global on this ST version.
//
// Position 1 (IN_CHAT), depth 0 — confirmed working for chat-completion
// backends. Position 0 (IN_PROMPT) was tested and did not appear in the
// outgoing prompt for this setup.
//
// KNOWN LIMITATION: GENERATE_BEFORE_COMBINE_PROMPTS does not reliably
// fire for chat-completion APIs (confirmed ST issue).
//
// CHAT_CHANGED: extension prompts appear to need re-setting after
// switching chats — matches Extension-Summaryception's own pattern of
// calling updateInjection() on chat change.

const INJECTION_KEY = "LWH_STATE";

export class PromptManager {
  constructor(runtime) {
    this.runtime = runtime;
    this._setExtensionPrompt = null;
  }

  init() {
    const {
      eventSource,
      event_types,
      SlashCommandParser,
      SlashCommand,
      setExtensionPrompt,
    } = SillyTavern.getContext();

    this._setExtensionPrompt = setExtensionPrompt;

    eventSource.on(event_types.APP_READY, () => {
      this._inject();
    });

    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
      this._inject();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
      this._inject();
    });

    SlashCommandParser.addCommandObject(
      SlashCommand.fromProps({
        name: "lwhinject",
        callback: () => {
          this._inject();
          alert(
            "LWH manual inject:\n" +
              JSON.stringify(this.runtime.getContract(), null, 2)
          );
          return "";
        },
        helpString: "Manually re-inject LWH Companion state and display it.",
      })
    );

    console.log("[PromptManager] Initialized, waiting for APP_READY.");
  }

  _inject() {
    const contract = this.runtime.getContract();
    const block = `<state>\n${JSON.stringify(contract, null, 2)}\n</state>`;

    // setExtensionPrompt(key, value, position, depth, scan, role)
    this._setExtensionPrompt(INJECTION_KEY, block, 1, 0, false, 0);

    console.log("[PromptManager] Injected state, gold=" + contract.sections?.resources?.data?.gold);
  }

  refresh() {
    this._inject();
  }

  debug() {
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(this.runtime.getContract(), null, 2));
  }
}
