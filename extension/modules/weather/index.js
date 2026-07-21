// extension/modules/weather/index.js

export default function (runtime) {
  return {
    init() {
      const existing = runtime.state.getOwnState("weather");
      if (!existing || Object.keys(existing).length === 0) {
        runtime.state.setState("weather", {
          condition: "overcast",
          temperature: "cold",
        });
      }
    },
  };
}
