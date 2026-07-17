// extension/core/module-loader.js
//
// Loads modules in dependency order based on their manifest's `reads` field.
// Fail-stop rule from DECISIONS_v0.3.md: if a module's hard `reads`
// dependency never loaded successfully, that module is skipped (not the
// whole Runtime) and it gets logged.

class ModuleLoader {
  constructor(stateManager, eventBus) {
    this.stateManager = stateManager;
    this.eventBus = eventBus;
    this.loaded = new Map(); // moduleId -> module instance
    this.failed = new Set(); // moduleIds that failed to load
  }

  // modules: array of { manifest, factory }
  //   manifest = the parsed module.json (id, reads, optionalReads, provides)
  //   factory  = a function(runtime) => moduleInstance with an init() method
  loadAll(modules) {
    // Simple dependency-respecting order: modules with no unmet `reads`
    // load first, repeat until nothing more can load.
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
          // A hard dependency already failed — this module fail-stops too.
          console.error(
            `[ModuleLoader] Skipping "${manifest.id}": missing hard dependency.`
          );
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

    // Anything still pending has an unresolvable/circular dependency.
    for (const { manifest } of pending) {
      console.error(
        `[ModuleLoader] Skipping "${manifest.id}": unresolved dependencies.`
      );
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

module.exports = { ModuleLoader };
