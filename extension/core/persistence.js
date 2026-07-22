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
    if (this._enabled) return Promise.resolve(this._restored); // already initialized
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

    const ctx = SillyTavern.getContext();

    // Helper: read a named browser global without ReferenceError.
    // ST exposes extension_settings and chat_metadata as window globals,
    // not always through getContext() — so we check both.
    const getGlobal = (name) => {
      try { return typeof window !== "undefined" ? window[name] : undefined; }
      catch { return undefined; }
    };

    // 1. Modern dedicated API.
    if (
      typeof ctx?.getExtensionChatMetadata === "function" &&
      typeof ctx?.setExtensionChatMetadata === "function"
    ) {
      console.log("[PersistenceService] Using modern chat-metadata API.");
      return {
        read: () => ctx.getExtensionChatMetadata(METADATA_ENTRY_KEY),
        write: async (payload) => {
          await ctx.setExtensionChatMetadata(METADATA_ENTRY_KEY, payload);
        },
        afterWrite: async () => {
          const save = ctx.saveMetadata ?? ctx.saveChat ?? getGlobal("saveChat");
          if (typeof save === "function") await save();
        },
      };
    }

    // 2. chat_metadata — try context then window global.
    //    Re-evaluated on each call (adapter not cached) so CHAT_CHANGED
    //    picks up the new chat's metadata object automatically.
    const chatMeta = ctx?.chat_metadata ?? getGlobal("chat_metadata");
    if (chatMeta && typeof chatMeta === "object") {
      console.log("[PersistenceService] Using chat_metadata adapter.");
      return {
        read: async () => {
          const meta = ctx?.chat_metadata ?? getGlobal("chat_metadata") ?? {};
          const root = meta[METADATA_ROOT_KEY] ?? meta.extensions;
          if (root && typeof root === "object") return root[METADATA_ENTRY_KEY] ?? null;
          return meta[METADATA_ENTRY_KEY] ?? null;
        },
        write: async (payload) => {
          const meta = ctx?.chat_metadata ?? getGlobal("chat_metadata") ?? {};
          const root = meta[METADATA_ROOT_KEY] ?? meta.extensions ?? {};
          if (!meta[METADATA_ROOT_KEY] && !meta.extensions) {
            meta[METADATA_ROOT_KEY] = root;
          } else if (!meta[METADATA_ROOT_KEY]) {
            meta.extensions = root;
          } else {
            meta[METADATA_ROOT_KEY] = root;
          }
          if (payload === null) {
            delete root[METADATA_ENTRY_KEY];
          } else {
            root[METADATA_ENTRY_KEY] = payload;
          }
        },
        afterWrite: async () => {
          const save =
            ctx?.saveMetadata ?? ctx?.saveChat ??
            getGlobal("saveMetadata") ?? getGlobal("saveChat");
          if (typeof save === "function") await save();
        },
      };
    }

    // 3. extension_settings — try context then window global.
    //    Shared across chats but better than nothing.
    const extSettings = ctx?.extension_settings ?? getGlobal("extension_settings");
    if (extSettings && typeof extSettings === "object") {
      console.warn(
        "[PersistenceService] Falling back to extension_settings (shared across chats)."
      );
      return {
        read: async () => {
          const s = ctx?.extension_settings ?? getGlobal("extension_settings") ?? {};
          return s[EXTENSION_SETTINGS_KEY] ?? null;
        },
        write: async (payload) => {
          const s = ctx?.extension_settings ?? getGlobal("extension_settings") ?? {};
          if (payload === null) {
            delete s[EXTENSION_SETTINGS_KEY];
          } else {
            s[EXTENSION_SETTINGS_KEY] = payload;
          }
        },
        afterWrite: async () => {
          const save =
            ctx?.saveExtensionSettings ?? ctx?.saveChat ??
            getGlobal("saveExtensionSettings") ?? getGlobal("saveChat");
          if (typeof save === "function") await save();
        },
      };
    }

    // Nothing worked — log what was visible to help diagnose.
    console.warn(
      "[PersistenceService] No persistence adapter found.",
      "\nContext keys:", Object.keys(ctx ?? {}).join(", "),
      "\nGlobals: chat_metadata =", typeof getGlobal("chat_metadata"),
      "| extension_settings =", typeof getGlobal("extension_settings")
    );
    return null;
  }
}
