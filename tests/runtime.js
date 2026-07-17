import { Runtime } from "../extension/core/index.js";
import { manifest as resourcesManifest } from "../extension/modules/resources/module.js";
import resourcesFactory from "../extension/modules/resources/index.js";
import { manifest as combatManifest } from "../extension/modules/combat/module.js";
import combatFactory from "../extension/modules/combat/index.js";
import { manifest as weatherManifest } from "../extension/modules/weather/module.js";
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
  console.log("\n✅ PASS: Runtime boots correctly with JS manifests");
} else {
  console.log("\n❌ FAIL: something went wrong");
}
