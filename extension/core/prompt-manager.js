// extension/core/prompt-manager.js
//
// Injects the Runtime state contract into SillyTavern's prompt system.
//
// IMPORTANT: setExtensionPrompt is NOT a bare global on this ST version.
// It must be pulled from SillyTavern.getContext(), same as eventSource.
// (Confirmed via ST's own st-context.js source — getContext() explicitly
// returns setExtensionPrompt as one of its properties.)

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
      console.log("[PromptManager] APP_READY received, injecting for the first time.");
      this._inject();
    });

    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
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
    this._setExtensionPrompt(INJECTION_KEY, block, 0, 0, false, 0);

    const gold = contract.sections?.resources?.data?.gold;
    toastr.info(`Injected state (gold=${gold})`, "LWH Companion", { timeOut: 2000 });
  }

  debug() {
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(this.runtime.getContract(), null, 2));
  }
}
