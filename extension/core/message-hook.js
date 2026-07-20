// extension/core/message-hook.js
//
// Listens for new AI messages via MESSAGE_RECEIVED. If the message
// contains an <lwh-delta> block: applies it to the Runtime, strips it
// from the stored message text, refreshes the display, saves, and
// re-injects updated state for the next prompt.

import { extractDelta, applyDelta } from "./delta-processor.js";

export class MessageHook {
  constructor(runtime, promptManager) {
    this.runtime = runtime;
    this.promptManager = promptManager;
  }

  init() {
    const { eventSource, event_types, SlashCommandParser, SlashCommand } =
      SillyTavern.getContext();

    eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
      this._handleMessage(messageIndex);
    });

    SlashCommandParser.addCommandObject(
      SlashCommand.fromProps({
        name: "lwhtestdelta",
        callback: async () => {
          const { chat } = SillyTavern.getContext();

          let idx = -1;
          for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user && !chat[i].is_system) {
              idx = i;
              break;
            }
          }

          if (idx === -1) {
            toastr.warning(
              "No AI message found. Send a message and get a reply first, then try again.",
              "LWH Companion"
            );
            return "";
          }

          chat[idx].mes +=
            ' <lwh-delta>{"resources":{"gold":-5},"combat":{"inProgress":true}}</lwh-delta>';

          await this._handleMessage(idx);

          console.log(
            "[MessageHook] Test delta injected into message " + idx +
              " (Runtime instance: " + this.runtime._instanceId + ")"
          );
          toastr.success(
            "Test delta injected into message " + idx + ". Run /lwhinject to confirm gold dropped to 37 and combat.inProgress is true.",
            "LWH Companion (instance " + this.runtime._instanceId + ")"
          );
          return "";
        },
        helpString: "DEBUG: simulate an AI-authored delta on the last AI message.",
      })
    );

    console.log("[MessageHook] Initialized, listening for MESSAGE_RECEIVED.");
  }

  async _handleMessage(messageIndex) {
    try {
      const { chat, saveChat, updateMessageBlock } = SillyTavern.getContext();
      const msg = chat[messageIndex];

      if (!msg || msg.is_user || msg.is_system) return;

      const { delta, cleanText } = extractDelta(msg.mes);
      if (!delta) return;

      applyDelta(this.runtime, delta);

      msg.mes = cleanText;
      updateMessageBlock(messageIndex, msg);
      await saveChat();

      this.promptManager.refresh();

      console.log("[MessageHook] Applied delta from message", messageIndex, delta);
    } catch (err) {
      console.error("[MessageHook] Error handling message:", err);
      toastr.error(err.message, "LWH MessageHook ERROR");
    }
  }
}
