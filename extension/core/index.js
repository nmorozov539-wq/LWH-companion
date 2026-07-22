// extension/core/index.js

import { StateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";
import { ModuleLoader } from "./module-loader.js";
import { PersistenceService } from "./persistence.js";
import { ScenarioService } from "./scenario-service.js";

export class Runtime {
  constructor() {
    this._instanceId = Math.random().toString(36).slice(2, 8);
    this.state = new StateManager();
    this.events = new EventBus();
    this.loader = new ModuleLoader(this.state, this.events);
    this.persistence = new PersistenceService();
    this.scenarios = new ScenarioService(this);
    this._booted = false;
    this._teardownFns = [];
    this._modules = [];
    this._baselineSnapshot = null;
  }

  async boot(modules) {
    if (this._booted) {
      console.warn("[Runtime] Already booted. Ignoring second boot() call.");
      return;
    }
    console.log("[Runtime] Booting... instance " + this._instanceId);

    this._modules = modules.map((entry) => ({
      manifest: entry.manifest,
      factory: entry.factory,
    }));

    // Persistence is NOT initialized here — the extension loads inside
    // ST's loadExtensionSettings before the context is fully ready.
    // syncPersistence() is called from APP_READY instead.
    const unsubscribe = this.state.subscribe(() => {
      try {
        this.persistence.scheduleSave(this.state.getSnapshot());
      } catch (err) {
        console.error("[Runtime] Failed to schedule persistence save:", err);
      }
    });
    this._teardownFns.push(unsubscribe);

    this.loader.loadAll(this._modules);
    this._baselineSnapshot = this.state.getSnapshot();
    this._booted = true;

    const loadedIds = [...this.loader.loaded.keys()];
    const failedIds = [...this.loader.failed];
    console.log(`[Runtime] Loaded:  ${loadedIds.join(", ") || "none"}`);
    if (failedIds.length > 0) {
      console.warn(`[Runtime] Failed:  ${failedIds.join(", ")}`);
    }
    this.events.emit("RuntimeStarted", { loadedIds, failedIds });
    return { loadedIds, failedIds };
  }

  // Called from APP_READY — context is fully initialized by then.
  async syncPersistence() {
    const manifests = this._modules.map((entry) => entry.manifest).filter(Boolean);
    try {
      const restored = await this.persistence.init(this.state, manifests);
      if (restored) {
        // Sync the loader to match what persistence actually restored.
        // boot() loaded all modules; deactivate any that weren't in the saved list.
        const activeModules = this.persistence.getActiveModules();
        for (const id of [...this.loader.loaded.keys()]) {
          if (!activeModules.includes(id)) {
            this.loader.unloadOne(id);
            // StateManager was already updated by _applyPayload (hydrate replaced all state)
          }
        }
        console.log("[Runtime] Persistence synced: restored", activeModules);
      } else {
        await this.persistence.saveNow();
        console.log("[Runtime] Persistence synced: new chat, defaults saved.");
      }
    } catch (err) {
      console.error("[Runtime] syncPersistence failed:", err);
    }
  }

  // ─── Module activation / deactivation ────────────────────────────────────

  getAvailableModules() {
    return this.loader.getRegisteredIds();
  }

  getActiveModules() {
    return [...this.loader.loaded.keys()];
  }

  async activateModule(id) {
    if (!this._booted) throw new Error("Runtime not booted.");
    if (this.loader.loaded.has(id)) return; // already active
    if (!this.loader._registry.has(id)) {
      throw new Error(`Module "${id}" is not registered. Available: ${this.loader.getRegisteredIds().join(", ")}`);
    }

    // Restore any previously preserved state BEFORE loading so init() sees it.
    const preserved = this.persistence.getPreservedSection(id);
    if (preserved) {
      // Pre-seed the namespace so init() doesn't overwrite with defaults.
      this.state.registerNamespace(id);
      this.state.setState(id, preserved);
      this.persistence.clearPreservedSection(id);
    }

    this.loader.loadOne(id); // registerNamespace is a no-op if already seeded
    await this.saveNow();
    console.log(`[Runtime] Activated module "${id}".`);
  }

  async deactivateModule(id) {
    if (!this._booted) throw new Error("Runtime not booted.");
    if (!this.loader.loaded.has(id)) return; // already inactive

    // Preserve current state so it survives the deactivation.
    const currentState = this.state.getOwnState(id);
    if (currentState) {
      this.persistence.preserveSection(id, currentState);
    }

    this.state.clearNamespace(id);
    this.loader.unloadOne(id);
    await this.saveNow();
    console.log(`[Runtime] Deactivated module "${id}" (state preserved).`);
  }

  // ─── State helpers ────────────────────────────────────────────────────────

  queryState(reader, target) {
    return this.state.queryState(reader, target);
  }

  getContract() {
    const versions = this.persistence.getModuleVersions();
    return this.state.toContract(versions);
  }

  isBooted() {
    return this._booted;
  }

  async saveNow(options = {}) {
    if (!this._booted) return;
    await this.persistence.saveNow(options);
  }

  async resetState() {
    if (this.persistence.isEnabled()) {
      await this.persistence.clear();
    }
    for (const id of [...this.loader.loaded.keys()]) {
      this.loader.unloadOne(id);
    }
    this.state.hydrate({}, { emitChange: false });
    this.loader.loadAll(this._modules);
    this._baselineSnapshot = this.state.getSnapshot();
    await this.saveNow();
  }

  teardown() {
    for (const fn of this._teardownFns.splice(0)) {
      try { fn(); } catch (err) {
        console.error("[Runtime] Teardown function threw:", err);
      }
    }
  }

  // ─── Chat change handling ─────────────────────────────────────────────────

  async handleChatChanged() {
    if (!this._booted) return;

    if (!this.persistence.isEnabled()) {
      this.state.hydrate(this._baselineSnapshot ?? {}, { emitChange: true });
      return;
    }

    try {
      // Unload all active modules from the loader (keeps registry intact).
      for (const id of [...this.loader.loaded.keys()]) {
        this.loader.unloadOne(id);
      }

      // reload() calls _applyPayload() which hydrates StateManager with only
      // active module state and stashes the rest in _preservedSections.
      const result = await this.persistence.reload({ emitChange: true });

      if (result.restored) {
        // Re-instantiate modules in the same order as their original loadAll()
        // so that dependency order is respected.
        const activeSet = new Set(result.activeModules);
        for (const { manifest } of this._modules) {
          if (activeSet.has(manifest.id)) {
            // State is already hydrated; loadOne won't overwrite it because
            // registerNamespace is a no-op and init() checks for existing state.
            this.loader.loadOne(manifest.id);
          }
        }
      } else {
        // Fresh chat: load all available modules with defaults.
        this.loader.loadAll(this._modules);
        this._baselineSnapshot = this.state.getSnapshot();
        await this.saveNow();
      }

      this.events.emit("RuntimeStateReloaded", result);
      return result;
    } catch (err) {
      console.error("[Runtime] Failed to reload state on chat change:", err);
      this.events.emit("RuntimeStateReloadFailed", err);
    }
  }
}
