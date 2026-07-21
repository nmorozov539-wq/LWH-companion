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
      callGenericPopup,
      POPUP_TYPE,
      requestAPICall,
    } = SillyTavern.getContext();

    this._setExtensionPrompt = setExtensionPrompt;
    this._callGenericPopup = callGenericPopup;
    this._POPUP_TYPE = POPUP_TYPE;

    eventSource.on(event_types.APP_READY, () => {
      this._inject();
    });

    const registerCommand = (props) => {
      SlashCommandParser.addCommandObject(SlashCommand.fromProps(props));
    };

    registerCommand({
      name: "lwhcurrentstate",
      callback: async () => {
        this._inject();
        const contract = this.runtime.getContract();
        const json = JSON.stringify(contract, null, 2);
        console.log("[PromptManager] LWH current state:\n" + json);
        await this._callGenericPopup(
          `<h3>LWH Companion — current state</h3><pre style=\"text-align:left; white-space:pre-wrap;\">${json}</pre>`,
          this._POPUP_TYPE.TEXT
        );
        return "";
      },
      helpString: "Show LWH Companion's current tracked state (also re-syncs it into the next prompt).",
    });

    registerCommand({
      name: "lwhresetstate",
      callback: async () => {
        await this.runtime.resetState();
        this.refresh();
        toastr.success("LWH Companion state cleared for this chat.", "LWH Companion");
        return "";
      },
      helpString: "Clear LWH Companion's persisted memory for the current chat.",
    });

    registerCommand({
      name: "lwhscenarios",
      callback: async (args) => {
        const output = await this.runtime.scenarios.handleCommand(args, {
          popup: this._callGenericPopup,
          popupType: this._POPUP_TYPE,
          requestAPICall,
        });
        return output || "";
      },
      helpString: "Scenario manager: list, apply templates, edit, or AI-generate starting state.",
    });

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
