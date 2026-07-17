// extension/core/event-bus.js

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(eventName, moduleId, handler, priority = 100) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }
    this._listeners.get(eventName).push({ moduleId, priority, handler });
    this._listeners.get(eventName).sort((a, b) => a.priority - b.priority);
  }

  emit(eventName, payload) {
    const listeners = this._listeners.get(eventName) || [];
    for (const { moduleId, handler } of listeners) {
      try {
        handler(payload);
      } catch (err) {
        console.error(
          `[EventBus] "${moduleId}" threw handling "${eventName}":`,
          err.message
        );
      }
    }
  }
}
