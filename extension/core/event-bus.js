// extension/core/event-bus.js
//
// Synchronous event dispatch with explicit numeric priority (lower runs
// first). If a listener throws, it's caught and logged — dispatch continues
// to the remaining listeners rather than crashing the Runtime.

class EventBus {
  constructor() {
    this._listeners = new Map(); // eventName -> [{ moduleId, priority, handler }]
  }

  // priority: lower number = runs earlier. Default 100.
  on(eventName, moduleId, handler, priority = 100) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }
    this._listeners.get(eventName).push({ moduleId, priority, handler });
    // Keep listeners sorted by priority every time one is added.
    this._listeners
      .get(eventName)
      .sort((a, b) => a.priority - b.priority);
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

module.exports = { EventBus };
