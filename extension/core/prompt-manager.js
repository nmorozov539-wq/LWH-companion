// extension/core/prompt-manager.js
//
// Injects the Runtime state contract into SillyTavern's prompt system.
// DEBUG MODE: shows a toastr every time injection runs, and registers
// a /lwhinject slash command to trigger + inspect it manually.

const INJECTION_KEY = "LWH_STATE";

export class PromptManager {
  constructor(runtime) {
    this.runtime = runtime;
  }

  init() {
    const { eventSource, event_types, SlashCommandParser, SlashCommand } =
      SillyTavern.getContext();

    eventSource.on(event_types.APP_READY, () => {
      console.log("[PromptManager] APP_READY received, injecting for the first time.");
      this._inject();
    });

    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, () => {
      this._inject();
    });

    // Manual debug command: type /lwhinject in any chat to force a
    // re-injection and see exactly what was sent to setExtensionPrompt.
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
    setExtensionPrompt(INJECTION_KEY, block, 0, 0, false, 0);

    // Visible confirmation every time this actually runs.
    const gold = contract.sections?.resources?.data?.gold;
    toastr.info(`Injected state (gold=${gold})`, "LWH Companion", { timeOut: 2000 });
  }

  debug() {
    console.log("[PromptManager] Current injection:");
    console.log(JSON.stringify(this.runtime.getContract(), null, 2));
  }
}
