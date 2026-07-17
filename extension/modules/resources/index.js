// extension/modules/resources/index.js
//
// Owns gold and rations. Has no dependencies on any other module.

module.exports = function (runtime) {
  return {
    init() {
      // Starting values. In the real extension this would come from
      // saved chat data instead of being hardcoded.
      runtime.state.setState("resources", {
        gold: 42,
        rations: 5,
      });
    },
  };
};
