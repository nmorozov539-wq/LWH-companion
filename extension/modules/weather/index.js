// extension/modules/weather/index.js

export default function (runtime) {
  return {
    init() {
      runtime.state.setState("weather", {
        condition: "overcast",
        temperature: "cold",
      });
    },
  };
}
