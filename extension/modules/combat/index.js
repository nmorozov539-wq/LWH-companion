// extension/modules/combat/index.js
//
// Previously cached resources.gold into its own state as "lastKnownGold".
// Removed — a module storing a copy of another module's data invites
// drift the moment either side updates independently (confirmed: after
// a resources delta, this stale copy no longer matched the real value).
// Combat still reads resources live via queryState() to prove the hard
// dependency actually works, but never persists a copy of it.

export default function (runtime) {
  return {
    init() {
      const resources = runtime.state.queryState("combat", "resources");
      console.log("[Combat] Resources available at boot:", resources);

      runtime.state.setState("combat", {
        inProgress: false,
      });
    },

    // delta example: { inProgress: true }
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
