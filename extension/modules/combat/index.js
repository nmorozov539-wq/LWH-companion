// extension/modules/combat/index.js

export default function (runtime) {
  return {
    init() {
      const resources = runtime.state.queryState("combat", "resources");
      const startingGold = resources ? resources.gold : 0;
      runtime.state.setState("combat", {
        inProgress: false,
        lastKnownGold: startingGold,
      });
    },

    // delta example: { inProgress: true }
    // Booleans are absolute (this state either is or isn't true),
    // unlike Resources' numeric fields which add.
    applyDelta(delta) {
      const current = runtime.state.getOwnState("combat");
      const updated = { ...current };

      if (typeof delta.inProgress === "boolean") {
        updated.inProgress = delta.inProgress;
      }

      runtime.state.setState("combat", updated);
    },
  };
}
