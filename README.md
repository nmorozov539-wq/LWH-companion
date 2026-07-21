# LWH Companion

A modular SillyTavern extension designed to demonstrate stateful runtime
modules, prompt injection, and delta-driven updates.

## Persistence

The Runtime persists module state in the active chat's metadata. This keeps
memory tied to each conversation and survives page reloads, SillyTavern restarts,
and chat exports/imports.

### How it works

* `PersistenceService` (extension/core/persistence.js) feature-detects the
  available storage APIs:
  * Prefers `getExtensionChatMetadata` / `setExtensionChatMetadata` when
    present (current builds of SillyTavern Desktop/Web).
  * Falls back to mutating `chat_metadata.extensions` and calling
    `saveMetadata()`/`saveChat()` for older builds.
  * If neither metadata path exists, it uses `extension_settings` as a last
    resort (shared across all chats, but still survives reloads).
* `StateManager` notifies listeners on every write. Runtime subscribes and
  asks PersistenceService to debounce-save the latest snapshot.
* On boot Runtime awaits `persistence.init(...)`, hydrates any stored state,
  then loads modules. Module `init()` functions now check for existing state so
  defaults only apply to fresh chats.
* Incoming deltas (`MessageHook._handleMessage`) call `runtime.saveNow()` after
  applying changes to ensure metadata is flushed even if the message text did
  not need rewriting.
* When the user switches chats, MESSAGE_HOOK listens for `CHAT_CHANGED`, asks
  Runtime to reload from metadata, and re-injects the new contract.

### Developer commands

Two slash commands are provided for inspection and recovery:

* `/lwhcurrentstate` – shows the current contract in a popup (and reinjects it
  into the prompt pipeline).
* `/lwhresetstate` – clears the persisted memory for the current chat and
  reinitializes all modules to their defaults (also writes a fresh snapshot to
  metadata).
* `/lwhscenarios` – scenario manager. Subcommands:
  * `list` – enumerate available templates.
  * `apply <templateId>` – load a template’s default values (honors the sign rules outlined in 🔌 Extension Integration).
  * `edit` – open a JSON editor for manual tweaking of module sections.
  * `ai` – ask the configured AI to draft a state block based on player persona
    and character context (validated before apply).
  * `reset` – same as `/lwhresetstate`.

### Testing tips

1. Boot SillyTavern with the extension enabled. Run `/lwhcurrentstate` to see
   the initial default contract.
2. Trigger updates (e.g., generate a reply that includes an `<lwh-delta>` block
   or use `/lwhtestupdate`). Observe `/lwhcurrentstate` reflecting the changes.
3. Reload the page or restart the client. After reconnecting, run
   `/lwhcurrentstate` again—the state should survive.
4. Switch to a different chat. The remembered state will follow that chat's
   metadata. Returning to the original chat restores its prior state.
5. Run `/lwhresetstate` (or `/lwhscenarios reset`) if you need to wipe the
   stored memory for the active conversation.

If persistence APIs are unavailable, warnings appear in the console and the
extension gracefully degrades to in-memory behavior.
