// extension/core/index.js

import { StateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";
import { ModuleLoader } from "./module-loader.js";
import { PersistenceService } from "./persistence.js";
import { ScenarioService } from "./scenario-service.js";

export class Runtime {
  constructor() {
    // Random ID to detect if multiple Runtime instances accidentally
    // exist at once (e.g. a stale extension load surviving a partial
    // reload) — visible via /lwhcurrentstate and /lwhtestupdate output.
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

    const manifests = this._modules.map((entry) => entry.manifest).filter(Boolean);
    try {
      await this.persistence.init(this.state, manifests);
    } catch (err) {
      console.error("[Runtime] Persistence initialization failed:", err);
    }

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
    this.loader.loaded.clear();
    this.loader.failed.clear();
    this.state.hydrate({}, { emitChange: false });
    this.loader.loadAll(this._modules);
    this._baselineSnapshot = this.state.getSnapshot();
    await this.saveNow();
  }

  teardown() {
    for (const fn of this._teardownFns.splice(0)) {
      try {
        fn();
      } catch (err) {
        console.error("[Runtime] Teardown function threw:", err);
      }
    }
  }

  async handleChatChanged() {
    if (!this._booted) return;

    if (!this.persistence.isEnabled()) {
      if (this._baselineSnapshot) {
        this.state.hydrate(this._baselineSnapshot, { emitChange: true });
      }
      return;
    }

    try {
      const result = await this.persistence.reload({
        emitChange: true,
        clearOnMismatch: true,
      });

      if (!result.restored) {
        this.state.hydrate({}, { emitChange: false });
        this.loader.loaded.clear();
        this.loader.failed.clear();
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
