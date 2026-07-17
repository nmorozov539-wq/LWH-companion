// extension/core/index.js

import { StateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";
import { ModuleLoader } from "./module-loader.js";

export class Runtime {
  constructor() {
    this.state = new StateManager();
    this.events = new EventBus();
    this.loader = new ModuleLoader(this.state, this.events);
    this._booted = false;
  }

  boot(modules) {
    if (this._booted) {
      console.warn("[Runtime] Already booted. Ignoring second boot() call.");
      return;
    }
    console.log("[Runtime] Booting...");
    this.loader.loadAll(modules);
    this._booted = true;

    const loadedIds = [...this.loader.loaded.keys()];
    const failedIds = [...this.loader.failed];
    console.log(`[Runtime] Loaded:  ${loadedIds.join(", ") || "none"}`);
    if (failedIds.length > 0) {
      console.warn(`[Runtime] Failed:  ${failedIds.join(", ")}`);
    }
    this.events.emit("RuntimeStarted", { loadedIds, failedIds });
  }

  queryState(reader, target) {
    return this.state.queryState(reader, target);
  }

  getContract() {
    return this.state.toContract();
  }

  isBooted() {
    return this._booted;
  }
}
