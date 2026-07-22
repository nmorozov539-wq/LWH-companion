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
    this._preservedSections = {};  // inactive module state kept across reloads
    this._activeModules = [];      // last known active module list
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
      activeModules: Object.keys(snapshot || {}),
      sections: {
        ...deepClone(snapshot || {}),           // active module states
        ...deepClone(this._preservedSections),  // preserved inactive states
      },
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
      const activeModules = this._applyPayload(payload, { emitChange: options.emitChange !== false });
      this._restored = true;
      return { restored: true, payloadFound: true, activeModules };
    }

    if (payload && options.clearOnMismatch) {
      await this._writePayload(null, { skipChatSave: options.skipChatSave === true });
    }

    this._restored = false;
    if (options.resetStateOnEmpty === true) {
      this._stateManager.reset();
    }
    return { restored: false, payloadFound: Boolean(payload), activeModules: [] };
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
    // Support both old format (modules key) and new format (sections + activeModules).
    const sections = payload.sections || payload.modules || {};
    const activeModules = payload.activeModules || Object.keys(sections);

    // Split into active state (goes into StateManager) and preserved state
    // (kept in memory but not injected into prompts).
    const activeState = {};
    for (const [id, data] of Object.entries(sections)) {
      if (activeModules.includes(id)) {
        activeState[id] = data;
      } else {
        // Merge into preserved — don't overwrite anything preserved this session.
        if (!this._preservedSections[id]) {
          this._preservedSections[id] = data;
        }
      }
    }

    this._activeModules = activeModules;
    this._stateManager.hydrate(activeState, { emitChange });
    this._latestSnapshot = this._stateManager.getSnapshot();
    return activeModules;
  }

  // --- Preserved section helpers (used by Runtime.activateModule / deactivateModule) ---

  preserveSection(moduleId, data) {
    this._preservedSections[moduleId] = deepClone(data);
  }

  getPreservedSection(moduleId) {
    return this._preservedSections[moduleId] ?? null;
  }

  clearPreservedSection(moduleId) {
    delete this._preservedSections[moduleId];
  }

  getActiveModules() {
    return [...this._activeModules];
  }

  _resolveAdapter() {
    if (!this._enabled) return null;

    // getContext() uses camelCase in this ST version:
    // chatMetadata, extensionSettings, updateChatMetadata, saveMetadata, etc.
    const ctx = SillyTavern.getContext();

    // 1. Modern dedicated API.
    if (
      typeof ctx?.getExtensionChatMetadata === "function" &&
      typeof ctx?.setExtensionChatMetadata === "function"
    ) {
      console.log("[PersistenceService] Using modern getExtensionChatMetadata API.");
      return {
        read: () => ctx.getExtensionChatMetadata(METADATA_ENTRY_KEY),
        write: async (payload) => {
          await ctx.setExtensionChatMetadata(METADATA_ENTRY_KEY, payload);
        },
        afterWrite: async () => {
          const save = ctx.saveMetadata ?? ctx.saveMetadataDebounced ?? ctx.saveChat;
          if (typeof save === "function") await save();
        },
      };
    }

    // 2. chatMetadata — the standard path in current ST builds.
    //    updateChatMetadata() is the correct write API; direct mutation
    //    is the fallback if it isn't available.
    if (ctx?.chatMetadata && typeof ctx.chatMetadata === "object") {
      console.log("[PersistenceService] Using chatMetadata adapter.");
      return {
        read: async () => {
          const meta = ctx.chatMetadata ?? {};
          const root = meta[METADATA_ROOT_KEY] ?? meta.extensions;
          if (root && typeof root === "object") return root[METADATA_ENTRY_KEY] ?? null;
          return meta[METADATA_ENTRY_KEY] ?? null;
        },
        write: async (payload) => {
          if (typeof ctx.updateChatMetadata === "function") {
            await ctx.updateChatMetadata({ [METADATA_ENTRY_KEY]: payload });
          } else {
            // Direct mutation fallback.
            const meta = ctx.chatMetadata ?? {};
            if (payload === null) {
              delete meta[METADATA_ENTRY_KEY];
            } else {
              meta[METADATA_ENTRY_KEY] = payload;
            }
          }
        },
        afterWrite: async () => {
          const save = ctx.saveMetadata ?? ctx.saveMetadataDebounced ?? ctx.saveChat;
          if (typeof save === "function") await save();
        },
      };
    }

    // 3. extensionSettings fallback — shared across chats but better than nothing.
    if (ctx?.extensionSettings && typeof ctx.extensionSettings === "object") {
      console.warn(
        "[PersistenceService] Falling back to extensionSettings (shared across chats)."
      );
      return {
        read: async () => (ctx.extensionSettings[EXTENSION_SETTINGS_KEY]) ?? null,
        write: async (payload) => {
          if (payload === null) {
            delete ctx.extensionSettings[EXTENSION_SETTINGS_KEY];
          } else {
            ctx.extensionSettings[EXTENSION_SETTINGS_KEY] = payload;
          }
        },
        afterWrite: async () => {
          const save = ctx.saveSettingsDebounced ?? ctx.saveExtensionSettings ?? ctx.saveChat;
          if (typeof save === "function") await save();
        },
      };
    }

    console.warn(
      "[PersistenceService] No persistence adapter found. Context keys: " +
      Object.keys(ctx ?? {}).join(", ")
    );
    return null;
  }
}
