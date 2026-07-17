// extension/core/module-loader.js

export class ModuleLoader {
  constructor(stateManager, eventBus) {
    this.stateManager = stateManager;
    this.eventBus = eventBus;
    this.loaded = new Map();
    this.failed = new Set();
  }

  loadAll(modules) {
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
          console.error(`[ModuleLoader] Skipping "${manifest.id}": missing hard dependency.`);
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
