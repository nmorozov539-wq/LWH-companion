// extension/core/state-manager.js
//
// Owns all module state. Rules enforced here:
// 1. A module may only WRITE to its own namespace (state.modules[moduleId]).
// 2. A module may READ any namespace via queryState(), but the result is
//    frozen (read-only) and every read is logged.
// 3. Reads of a namespace that doesn't exist return undefined, never throw.

class StateManager {
  constructor() {
    this._state = { modules: {} };
    this._readLog = []; // { reader, target, timestamp }
  }

  // Called once per module at load time to create its namespace.
  registerNamespace(moduleId) {
    if (!this._state.modules[moduleId]) {
      this._state.modules[moduleId] = {};
    }
  }

  // A module calls this to overwrite/merge its OWN namespace.
  // moduleId must match the namespace being written — this is the
  // write-isolation rule from ARCHITECTURE.md.
  setState(moduleId, data) {
    if (!this._state.modules[moduleId]) {
      throw new Error(
        `[StateManager] Cannot write to unregistered namespace "${moduleId}"`
      );
    }
    this._state.modules[moduleId] = {
      ...this._state.modules[moduleId],
      ...data,
    };
  }

  // A module calls this to read its OWN namespace (unfrozen, for convenience).
  getOwnState(moduleId) {
    return this._state.modules[moduleId];
  }

  // The read API from DECISIONS_v0.3.md.
  // reader = moduleId doing the reading (for the log)
  // target = namespace being read
  queryState(reader, target) {
    this._readLog.push({
      reader,
      target,
      timestamp: Date.now(),
    });

    const data = this._state.modules[target];
    if (data === undefined) return undefined;

    // Return a frozen shallow copy so callers can't mutate another
    // module's state through the reference.
    return Object.freeze({ ...data });
  }

  // Returns the full read log, useful for debugging which modules
  // actually depend on which other modules at runtime.
  getReadGraph() {
    return this._readLog;
  }

  // Serializes current state into the STATE_CONTRACT.md JSON shape.
  // sectionVersions: { resources: 1, combat: 1, ... } — each module
  // supplies its own section version.
  toContract(sectionVersions = {}) {
    const sections = {};
    for (const [moduleId, data] of Object.entries(this._state.modules)) {
      sections[moduleId] = {
        version: sectionVersions[moduleId] || 1,
        data,
      };
    }
    return {
      contractVersion: 1,
      sections,
      activeModules: Object.keys(this._state.modules),
    };
  }
}

module.exports = { StateManager };
