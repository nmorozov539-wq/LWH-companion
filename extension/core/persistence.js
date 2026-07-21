// extension/core/persistence.js
//
// Persists the Runtime state into the active chat's metadata so that
// SillyTavern reloads (or full page refreshes) keep module memory.
//
// The implementation is intentionally defensive: it feature-detects the
// available SillyTavern APIs at runtime and falls back to extension-wide
// storage if chat metadata helpers are not present. When running in a pure
// Node environment (e.g. local unit tests) persistence is disabled but the
// rest of the Runtime still functions.

const STORAGE_VERSION = 1;
const METADATA_ROOT_KEY = "extensions";
const METADATA_ENTRY_KEY = "lwh-companion";
const EXTENSION_SETTINGS_KEY = "lwh-companion";
const SAVE_DEBOUNCE_MS = 400;

function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export class PersistenceService {
  constructor() {
    this._enabled = false;
    this._stateManager = null;
    this._moduleVersions = {};
    this._debounceHandle = null;
    this._latestSnapshot = null;
    this._restored = false;
  }

  /**
   * @param {import('./state-manager.js').StateManager} stateManager
   * @param {Array<{ id: string, version?: string | number }>} manifests
   * @returns {Promise<boolean>|null} Promise resolving to true when a stored
   *          state was restored. Returns null when persistence is disabled.
   */
  init(stateManager, manifests = []) {
    this._stateManager = stateManager;
    this._moduleVersions = {};
    for (const manifest of manifests) {
      if (manifest && manifest.id) {
        this._moduleVersions[manifest.id] = manifest.version || 1;
      }
    }

    if (typeof SillyTavern === "undefined" ||
        typeof SillyTavern.getContext !== "function") {
      // Running outside of SillyTavern (tests, CLI etc) — operate in
      // stateless mode without failing the Runtime boot process.
      this._enabled = false;
      return null;
    }

    // Do NOT capture context here — no chat is loaded yet at boot time
    // (APP_READY hasn't fired). Context is resolved fresh on each operation
    // so that chat_metadata is available after the first CHAT_CHANGED.
    this._enabled = true;

    return this._readPayload()
      .then((payload) => {
        if (payload && this._isPayloadCompatible(payload)) {
          this._applyPayload(payload, { emitChange: false });
          this._restored = true;
        } else if (payload) {
          console.warn(
            "[PersistenceService] Ignoring persisted state due to version mismatch"
          );
        }
        return this._restored;
      })
      .catch((err) => {
        console.error("[PersistenceService] Failed to read persisted state:", err);
        return false;
      });
  }

  isEnabled() {
    return this._enabled;
  }

  wasRestored() {
    return this._restored;
  }

  getModuleVersions() {
    return { ...this._moduleVersions };
  }

  scheduleSave(snapshot) {
    if (!this._enabled) return;

    this._latestSnapshot = snapshot || this._stateManager.getSnapshot();
    if (this._debounceHandle) {
      clearTimeout(this._debounceHandle);
    }
    this._debounceHandle = setTimeout(() => {
      this.saveNow().catch((err) => {
        console.error("[PersistenceService] Failed to persist state:", err);
      });
    }, SAVE_DEBOUNCE_MS);
  }

  async saveNow(options = {}) {
    if (!this._enabled) return;
    if (this._debounceHandle) {
      clearTimeout(this._debounceHandle);
      this._debounceHandle = null;
    }

    const snapshot = options.snapshot || this._latestSnapshot || this._stateManager.getSnapshot();
    const payload = {
      storageVersion: STORAGE_VERSION,
      manifestVersions: { ...this._moduleVersions },
      modules: deepClone(snapshot || {}),
      savedAt: Date.now(),
    };

    await this._writePayload(payload, { skipChatSave: options.skipChatSave === true });
    this._latestSnapshot = snapshot;
  }

  async clear() {
    if (!this._enabled) return;
    if (this._debounceHandle) {
      clearTimeout(this._debounceHandle);
      this._debounceHandle = null;
    }
    await this._writePayload(null);
    this._latestSnapshot = null;
    this._restored = false;
  }

  async reload(options = {}) {
    if (!this._enabled) {
      return { restored: false, payloadFound: false };
    }

    const payload = await this._readPayload();
    if (payload && this._isPayloadCompatible(payload)) {
      this._applyPayload(payload, { emitChange: options.emitChange !== false });
      this._restored = true;
      return { restored: true, payloadFound: true };
    }

    if (payload && options.clearOnMismatch) {
      await this._writePayload(null, { skipChatSave: options.skipChatSave === true });
    }

    this._restored = false;
    if (options.resetStateOnEmpty === true) {
      this._stateManager.reset();
    }
    return { restored: false, payloadFound: Boolean(payload) };
  }

  _isPayloadCompatible(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (payload.storageVersion !== STORAGE_VERSION) return false;

    const persistedVersions = payload.manifestVersions || {};
    for (const [moduleId, version] of Object.entries(this._moduleVersions)) {
      if (
        Object.prototype.hasOwnProperty.call(persistedVersions, moduleId) &&
        persistedVersions[moduleId] !== version
      ) {
        return false;
      }
    }

    return true;
  }

  async _readPayload() {
    const adapter = this._resolveAdapter();
    if (!adapter) return null;
    return adapter.read();
  }

  async _writePayload(payload, { skipChatSave = false } = {}) {
    const adapter = this._resolveAdapter();
    if (!adapter) return;

    await adapter.write(payload);

    if (!skipChatSave && adapter.afterWrite) {
      await adapter.afterWrite();
    }
  }

  _applyPayload(payload, { emitChange = true } = {}) {
    this._stateManager.hydrate(payload.modules || {}, { emitChange });
    this._latestSnapshot = this._stateManager.getSnapshot();
  }

  _resolveAdapter() {
    if (!this._enabled) return null;

    // Always resolve against a fresh context — do NOT cache the adapter.
    // At boot time (when init() runs) no chat is loaded yet, so
    // chat_metadata doesn't exist. Caching the adapter at that point
    // permanently locks us into the extension_settings fallback even
    // after CHAT_CHANGED fires and a real chat becomes available.
    const ctx = SillyTavern.getContext();

    // Preferred modern API: dedicated helpers for extension chat metadata.
    if (
      typeof ctx?.getExtensionChatMetadata === "function" &&
      typeof ctx?.setExtensionChatMetadata === "function"
    ) {
      return {
        read: () => ctx.getExtensionChatMetadata(METADATA_ENTRY_KEY),
        write: async (payload) => {
          await ctx.setExtensionChatMetadata(METADATA_ENTRY_KEY, payload);
        },
        afterWrite: async () => {
          if (typeof ctx.saveMetadata === "function") {
            await ctx.saveMetadata();
          } else if (typeof ctx.saveChat === "function") {
            await ctx.saveChat();
          }
        },
      };
    }

    // Legacy path: manipulate chat_metadata object directly.
    if (ctx && typeof ctx === "object" && ctx.chat_metadata) {
      return {
        read: async () => {
          const root = ctx.chat_metadata?.[METADATA_ROOT_KEY] ||
            ctx.chat_metadata?.extensions;
          if (root && typeof root === "object") {
            return root[METADATA_ENTRY_KEY] || null;
          }
          return ctx.chat_metadata[METADATA_ENTRY_KEY] || null;
        },
        write: async (payload) => {
          if (!ctx.chat_metadata || typeof ctx.chat_metadata !== "object") {
            ctx.chat_metadata = {};
          }

          const root = ctx.chat_metadata[METADATA_ROOT_KEY] || ctx.chat_metadata.extensions || {};
          if (!ctx.chat_metadata[METADATA_ROOT_KEY] && !ctx.chat_metadata.extensions) {
            ctx.chat_metadata[METADATA_ROOT_KEY] = root;
          } else if (!ctx.chat_metadata[METADATA_ROOT_KEY]) {
            ctx.chat_metadata.extensions = root;
          } else {
            ctx.chat_metadata[METADATA_ROOT_KEY] = root;
          }

          if (payload === null) {
            delete root[METADATA_ENTRY_KEY];
          } else {
            root[METADATA_ENTRY_KEY] = payload;
          }
        },
        afterWrite: async () => {
          if (typeof ctx.saveMetadata === "function") {
            await ctx.saveMetadata();
          } else if (typeof ctx.saveChat === "function") {
            await ctx.saveChat();
          }
        },
      };
    }

    // Fallback: extension-wide settings (persists across chats, but better
    // than nothing if metadata helpers are unavailable).
    if (ctx && typeof ctx === "object" && ctx.extension_settings) {
      console.warn(
        "[PersistenceService] Falling back to extension_settings for persistence; state will be shared across chats"
      );
      return {
        read: async () => ctx.extension_settings[EXTENSION_SETTINGS_KEY] || null,
        write: async (payload) => {
          if (payload === null) {
            delete ctx.extension_settings[EXTENSION_SETTINGS_KEY];
          } else {
            ctx.extension_settings[EXTENSION_SETTINGS_KEY] = payload;
          }
        },
        afterWrite: async () => {
          if (typeof ctx.saveExtensionSettings === "function") {
            await ctx.saveExtensionSettings();
          } else if (typeof ctx.saveChat === "function") {
            await ctx.saveChat();
          }
        },
      };
    }

    console.warn(
      "[PersistenceService] No persistence adapter available; state will reset on reload"
    );
    return null;
  }
}
