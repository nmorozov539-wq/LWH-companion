// extension/modules/combat/index.js
//
// Hard-depends on "resources" (declared in module.json's `reads`).
// Reads Resources' gold via queryState to show cross-module reads working.

module.exports = function (runtime) {
  return {
    init() {
      const resources = runtime.state.queryState("combat", "resources");

      // Because "resources" is in this module's hard `reads`, the loader
      // guarantees it already loaded successfully before we get here —
      // so `resources` should never be undefined in normal operation.
      // We still guard it, since queryState can return undefined if a
      // namespace was somehow never registered.
      const startingGold = resources ? resources.gold : 0;

      runtime.state.setState("combat", {
        inProgress: false,
        lastKnownGold: startingGold,
      });
    },
  };
};
