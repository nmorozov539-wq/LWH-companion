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
  };
}
