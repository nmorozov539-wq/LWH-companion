// extension/core/message-hook.js
//
// Listens for new AI messages via MESSAGE_RECEIVED. If the message
// contains an <lwh_delta> block: applies it to the Runtime, strips it
// from the stored message text (so it never pollutes future context
// or shows to the user), refreshes the display, saves, and re-injects
// updated state for the next prompt.
//
// KNOWN FOLLOW-UP: this doesn't yet account for swipes/regeneration —
// if a message is swiped, its old delta was already applied and isn't
// currently reversed. Fine for now since nothing depends on it yet;
// worth revisiting once deltas actually matter for real play.

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

    // DEBUG TOOL: simulates an AI message containing a delta block,
    // without needing the real LLM to actually emit one yet. Finds the
    // most recent AI message, appends a test delta to it, and runs it
    // through the exact same handling path as a real message.
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
            alert("No AI message found. Send a message and get a reply first, then try again.");
            return "";
          }

          chat[idx].mes +=
            ' <lwh_delta>{"resources":{"gold":-5},"combat":{"inProgress":true}}</lwh_delta>';

          await this._handleMessage(idx);

          alert(
            "Test delta injected into message " +
              idx +
              ". Run /lwhinject to confirm gold dropped to 37 and combat.inProgress is true."
          );
          return "";
        },
        helpString: "DEBUG: simulate an AI-authored delta on the last AI message.",
      })
    );

    console.log("[MessageHook] Initialized, listening for MESSAGE_RECEIVED.");
  }

  async _handleMessage(messageIndex) {
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
  }
}
