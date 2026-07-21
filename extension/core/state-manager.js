// extension/core/state-manager.js

function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export class StateManager {
  constructor() {
    this._state = { modules: {} };
    this._readLog = [];
    this._listeners = new Set();
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
    this._notifyChange();
  }

  getOwnState(moduleId) {
    return this._state.modules[moduleId];
  }

  reset({ emitChange = true } = {}) {
    this.hydrate({}, { emitChange });
  }

  hydrate(modulesState, { emitChange = true } = {}) {
    if (!modulesState || typeof modulesState !== "object") return;
    this._state.modules = {};
    for (const [moduleId, data] of Object.entries(modulesState)) {
      this._state.modules[moduleId] = deepClone(data);
    }
    if (emitChange) {
      this._notifyChange();
    }
  }

  getSnapshot() {
    return deepClone(this._state.modules);
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  _notifyChange() {
    for (const listener of this._listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error("[StateManager] Listener threw during notification:", err);
      }
    }
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
