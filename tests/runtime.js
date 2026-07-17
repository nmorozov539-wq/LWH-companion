// tests/runtime.js
//
// Boots the Runtime through the real entry point and checks that
// everything still works the same way as the individual tests.

const { Runtime } = require("../extension/core/index");

const resourcesManifest = require("../extension/modules/resources/module.json");
const resourcesFactory = require("../extension/modules/resources/index.js");
const combatManifest = require("../extension/modules/combat/module.json");
const combatFactory = require("../extension/modules/combat/index.js");
const weatherManifest = require("../extension/modules/weather/module.json");
const weatherFactory = require("../extension/modules/weather/index.js");

const runtime = new Runtime();

// Listen for RuntimeStarted before booting
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
  console.log("\n✅ PASS: Runtime boots and queryState works through entry point");
} else {
  console.log("\n❌ FAIL: something went wrong");
}
