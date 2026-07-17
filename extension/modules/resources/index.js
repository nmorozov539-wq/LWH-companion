// extension/modules/resources/index.js

export default function (runtime) {
  return {
    init() {
      runtime.state.setState("resources", {
        gold: 42,
        rations: 5,
      });
    },
  };
}
