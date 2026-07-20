// extension/core/index.js

import { StateManager } from "./state-manager.js";
import { EventBus } from "./event-bus.js";
import { ModuleLoader } from "./module-loader.js";

export class Runtime {
  constructor() {
    // Random ID to detect if multiple Runtime instances accidentally
    // exist at once (e.g. a stale extension load surviving a partial
    // reload) — visible via /lwhinject and /lwhtestdelta output.
    this._instanceId = Math.random().toString(36).slice(2, 8);

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
    console.log("[Runtime] Booting... instance " + this._instanceId);
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
