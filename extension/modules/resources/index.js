// extension/modules/resources/index.js

export default function (runtime) {
  return {
    init() {
      runtime.state.setState("resources", {
        gold: 42,
        rations: 5,
      });
    },

    // delta example: { gold: -5, rations: -1 }
    // Numeric fields are added to the current value, not overwritten.
    applyDelta(delta) {
      const current = runtime.state.getOwnState("resources");
      const updated = { ...current };

      if (typeof delta.gold === "number") {
        updated.gold = (current.gold || 0) + delta.gold;
      }
      if (typeof delta.rations === "number") {
        updated.rations = (current.rations || 0) + delta.rations;
      }

      runtime.state.setState("resources", updated);
    },
  };
}
