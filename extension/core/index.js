// extension/core/index.js
//
// The Runtime. Wires together StateManager, EventBus, and ModuleLoader
// into a single object. Everything else in the extension talks to this,
// never to the individual pieces directly.

const { StateManager } = require("./state-manager");
const { EventBus } = require("./event-bus");
const { ModuleLoader } = require("./module-loader");

class Runtime {
  constructor() {
    this.state = new StateManager();
    this.events = new EventBus();
    this.loader = new ModuleLoader(this.state, this.events);
    this._booted = false;
  }

  // modules: array of { manifest, factory }
  // Same shape the test scripts already use.
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

  // Convenience passthrough so callers don't need to reach into this.state
  queryState(reader, target) {
    return this.state.queryState(reader, target);
  }

  // Returns the current state contract — ready to inject into a prompt.
  getContract() {
    return this.state.toContract();
  }

  isBooted() {
    return this._booted;
  }
}

module.exports = { Runtime };
