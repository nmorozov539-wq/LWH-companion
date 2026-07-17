// tests/run.js
//
// Plain Node script — no SillyTavern needed. Proves two things:
// 1. Combat can read Resources' state via queryState (the core decision).
// 2. If Resources is missing, Combat fails to load cleanly (fail-stop),
//    instead of crashing everything.

const { StateManager } = require("../extension/core/state-manager");
const { EventBus } = require("../extension/core/event-bus");
const { ModuleLoader } = require("../extension/core/module-loader");

const resourcesManifest = require("../extension/modules/resources/module.json");
const resourcesFactory = require("../extension/modules/resources/index.js");
const combatManifest = require("../extension/modules/combat/module.json");
const combatFactory = require("../extension/modules/combat/index.js");

function section(title) {
  console.log("\n=== " + title + " ===");
}

// --- Test 1: normal load, both modules present ---
section("TEST 1: Normal load (resources + combat)");

const stateManager1 = new StateManager();
const eventBus1 = new EventBus();
const loader1 = new ModuleLoader(stateManager1, eventBus1);

loader1.loadAll([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
]);

console.log("\nFinal state contract:");
console.log(JSON.stringify(stateManager1.toContract(), null, 2));

console.log("\nRead graph (who read what):");
console.log(stateManager1.getReadGraph());

const combatState = stateManager1.getOwnState("combat");
if (combatState && combatState.lastKnownGold === 42) {
  console.log("\n✅ PASS: combat correctly read resources.gold (42) via queryState");
} else {
  console.log("\n❌ FAIL: combat did not read resources correctly");
}

// --- Test 2: fail-stop, resources missing ---
section("TEST 2: Fail-stop (combat loaded WITHOUT resources)");

const stateManager2 = new StateManager();
const eventBus2 = new EventBus();
const loader2 = new ModuleLoader(stateManager2, eventBus2);

loader2.loadAll([
  { manifest: combatManifest, factory: combatFactory },
  // resources deliberately NOT included this time
]);

if (loader2.failed.has("combat") && !loader2.loaded.has("combat")) {
  console.log("\n✅ PASS: combat correctly fail-stopped with resources missing");
} else {
  console.log("\n❌ FAIL: combat should have failed to load but didn't");
}

section("Done");
