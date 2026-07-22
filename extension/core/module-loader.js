// extension/core/module-loader.js

export class ModuleLoader {
  constructor(stateManager, eventBus) {
    this.stateManager = stateManager;
    this.eventBus = eventBus;
    this.loaded = new Map();   // id → instance  (currently active)
    this.failed = new Set();
    this._registry = new Map(); // id → { manifest, factory }  (all known)
  }

  // Register all modules and load them in dependency order.
  loadAll(modules) {
    // Populate registry first so loadOne() works for any id later.
    for (const entry of modules) {
      this._registry.set(entry.manifest.id, entry);
    }

    const pending = [...modules];
    let progress = true;

    while (pending.length > 0 && progress) {
      progress = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const { manifest, factory } = pending[i];
        const hardDeps = manifest.reads || [];
        const depsSatisfied = hardDeps.every((dep) => this.loaded.has(dep));
        const depsFailed = hardDeps.some((dep) => this.failed.has(dep));

        if (depsFailed) {
          console.error(`[ModuleLoader] Skipping "${manifest.id}": dependency failed.`);
          this.failed.add(manifest.id);
          pending.splice(i, 1);
          progress = true;
          continue;
        }

        if (depsSatisfied) {
          this._loadOne(manifest, factory);
          pending.splice(i, 1);
          progress = true;
        }
      }
    }

    for (const { manifest } of pending) {
      console.error(`[ModuleLoader] Skipping "${manifest.id}": unresolved dependencies.`);
      this.failed.add(manifest.id);
    }
  }

  // Activate a single registered module on demand.
  loadOne(moduleId) {
    const entry = this._registry.get(moduleId);
    if (!entry) throw new Error(`[ModuleLoader] Module "${moduleId}" is not registered.`);
    if (this.loaded.has(moduleId)) return; // already active

    // Hard dependency check — gives a clear error instead of silently breaking.
    const hardDeps = entry.manifest.reads || [];
    for (const dep of hardDeps) {
      if (!this.loaded.has(dep)) {
        throw new Error(
          `[ModuleLoader] Cannot activate "${moduleId}": requires "${dep}" to be active first.`
        );
      }
    }

    this.failed.delete(moduleId); // clear any previous failure
    this._loadOne(entry.manifest, entry.factory);
  }

  // Deactivate a loaded module. Calls destroy() if the instance has it.
  unloadOne(moduleId) {
    const instance = this.loaded.get(moduleId);
    if (!instance) return;
    if (typeof instance.destroy === "function") {
      try { instance.destroy(); } catch (err) {
        console.error(`[ModuleLoader] "${moduleId}" threw during destroy:`, err);
      }
    }
    this.loaded.delete(moduleId);
  }

  // All module IDs known to the registry (active or not).
  getRegisteredIds() {
    return [...this._registry.keys()];
  }

  _loadOne(manifest, factory) {
    try {
      this.stateManager.registerNamespace(manifest.id);
      const runtime = {
        state: this.stateManager,
        events: this.eventBus,
        moduleId: manifest.id,
      };
      const instance = factory(runtime);
      if (typeof instance.init === "function") {
        instance.init();
      }
      this.loaded.set(manifest.id, instance);
      console.log(`[ModuleLoader] Loaded "${manifest.id}"`);
    } catch (err) {
      console.error(`[ModuleLoader] "${manifest.id}" threw during load:`, err.message);
      this.failed.add(manifest.id);
    }
  }
}
