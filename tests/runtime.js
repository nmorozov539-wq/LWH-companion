// tests/runtime.js

import { Runtime } from "../extension/core/index.js";
import resourcesManifest from "../extension/modules/resources/module.json" with { type: "json" };
import resourcesFactory from "../extension/modules/resources/index.js";
import combatManifest from "../extension/modules/combat/module.json" with { type: "json" };
import combatFactory from "../extension/modules/combat/index.js";
import weatherManifest from "../extension/modules/weather/module.json" with { type: "json" };
import weatherFactory from "../extension/modules/weather/index.js";

const runtime = new Runtime();

runtime.events.on("RuntimeStarted", "test", (payload) => {
  console.log("\n[RuntimeStarted event received]");
  console.log("  Loaded: ", payload.loadedIds);
  console.log("  Failed: ", payload.failedIds);
});

runtime.boot([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
  { manifest: weatherManifest, factory: weatherFactory },
]);

console.log("\n=== State Contract ===");
console.log(JSON.stringify(runtime.getContract(), null, 2));

console.log("\n=== Read Graph ===");
console.log(runtime.state.getReadGraph());

const gold = runtime.queryState("test", "resources").gold;
if (gold === 42) {
  console.log("\n✅ PASS: Runtime boots correctly as ES module");
} else {
  console.log("\n❌ FAIL: something went wrong");
}
