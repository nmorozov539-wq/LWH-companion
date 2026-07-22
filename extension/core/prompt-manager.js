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
      POPUP_RESULT,
      Popup,
      requestAPICall,
    } = SillyTavern.getContext();

    this._setExtensionPrompt = setExtensionPrompt;
    this._callGenericPopup = callGenericPopup;
    this._POPUP_TYPE = POPUP_TYPE;
    this._POPUP_RESULT = POPUP_RESULT;
    this._Popup = Popup;

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

    const scenarioContext = () => ({
      popup: this._callGenericPopup,
      popupType: this._POPUP_TYPE,
      Popup: this._Popup,
      POPUP_RESULT: this._POPUP_RESULT,
      requestAPICall,
      refresh: () => this.refresh(),
    });

    registerCommand({
      name: "lwhscenarios",
      callback: async (namedArgs, value) => {
        const output = await this.runtime.scenarios.handleCommand(value || "", scenarioContext());
        return output || "";
      },
      helpString: "Scenario manager: /lwhscenarios list | apply <id> | reset",
    });

    registerCommand({
      name: "lwhscenarios_edit",
      callback: async () => {
        const output = await this.runtime.scenarios.handleCommand("edit", scenarioContext());
        return output || "";
      },
      helpString: "Open the state editor: edit all tracked module values as JSON.",
    });

    registerCommand({
      name: "lwh_modules",
      callback: async () => {
        const available = this.runtime.getAvailableModules();
        const active = new Set(this.runtime.getActiveModules());
        const lines = available.map((id) => `${active.has(id) ? "✓" : "○"} ${id}`);
        await this._callGenericPopup(
          "<h3>LWH — Modules</h3><pre style='text-align:left;'>" + lines.join("\n") + "</pre>",
          this._POPUP_TYPE.TEXT
        );
        return "";
      },
      helpString: "List all registered modules and which are active for this chat.",
    });

    registerCommand({
      name: "lwh_activate",
      callback: async (namedArgs, value) => {
        const id = value?.trim();
        if (!id) return "Usage: /lwh_activate <moduleId>";
        try {
          await this.runtime.activateModule(id);
          this.refresh();
          toastr.success(`Module "${id}" activated.`, "LWH Companion");
          return `Module "${id}" activated.`;
        } catch (err) {
          toastr.error(err.message, "LWH Companion");
          return `Failed: ${err.message}`;
        }
      },
      helpString: "Activate a module for the current chat: /lwh_activate <moduleId>",
    });

    registerCommand({
      name: "lwh_deactivate",
      callback: async (namedArgs, value) => {
        const id = value?.trim();
        if (!id) return "Usage: /lwh_deactivate <moduleId>";
        try {
          await this.runtime.deactivateModule(id);
          this.refresh();
          toastr.success(`Module "${id}" deactivated (state preserved).`, "LWH Companion");
          return `Module "${id}" deactivated.`;
        } catch (err) {
          toastr.error(err.message, "LWH Companion");
          return `Failed: ${err.message}`;
        }
      },
      helpString: "Deactivate a module for this chat, state is preserved: /lwh_deactivate <moduleId>",
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
