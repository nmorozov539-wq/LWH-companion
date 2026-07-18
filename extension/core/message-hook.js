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
    const { eventSource, event_types } = SillyTavern.getContext();

    eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex) => {
      this._handleMessage(messageIndex);
    });

    console.log("[MessageHook] Initialized, listening for MESSAGE_RECEIVED.");
  }

  async _handleMessage(messageIndex) {
    const { chat, saveChat, updateMessageBlock } = SillyTavern.getContext();
    const msg = chat[messageIndex];

    // Only process AI messages — never the user's own or system messages.
    if (!msg || msg.is_user || msg.is_system) return;

    const { delta, cleanText } = extractDelta(msg.mes);
    if (!delta) return; // nothing to do, leave the message untouched

    applyDelta(this.runtime, delta);

    // Strip the delta block from the stored message so future prompts
    // built from chat history stay clean.
    msg.mes = cleanText;
    updateMessageBlock(messageIndex, msg);
    await saveChat();

    // Reflect the change in the next prompt immediately.
    this.promptManager.refresh();

    console.log("[MessageHook] Applied delta from message", messageIndex, delta);
  }
}
