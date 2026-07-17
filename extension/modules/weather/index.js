// extension/modules/weather/index.js
//
// Owns weather state. No dependencies on any other module.
// Exists to prove removability: adding or removing this module
// must not affect resources or combat in any way.

module.exports = function (runtime) {
  return {
    init() {
      runtime.state.setState("weather", {
        condition: "overcast",
        temperature: "cold",
      });
    },
  };
};
