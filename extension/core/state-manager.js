// extension/core/state-manager.js

export class StateManager {
  constructor() {
    this._state = { modules: {} };
    this._readLog = [];
  }

  registerNamespace(moduleId) {
    if (!this._state.modules[moduleId]) {
      this._state.modules[moduleId] = {};
    }
  }

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

  getOwnState(moduleId) {
    return this._state.modules[moduleId];
  }

  queryState(reader, target) {
    this._readLog.push({ reader, target, timestamp: Date.now() });
    const data = this._state.modules[target];
    if (data === undefined) return undefined;
    return Object.freeze({ ...data });
  }

  getReadGraph() {
    return this._readLog;
  }

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
