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

    // delta example: { condition: "clear", temperature: "warm" }
    // String fields replace the current value (no arithmetic).
    applyDelta(delta) {
      const current = runtime.state.getOwnState("weather");
      const updated = { ...current };

      if (typeof delta.condition === "string") {
        updated.condition = delta.condition;
      }
      if (typeof delta.temperature === "string") {
        updated.temperature = delta.temperature;
      }

      runtime.state.setState("weather", updated);
    },
  };
}
