// tests/removability.js
//
// Proves that adding or removing the weather module has zero effect
// on resources and combat.

const { StateManager } = require("../extension/core/state-manager");
const { EventBus } = require("../extension/core/event-bus");
const { ModuleLoader } = require("../extension/core/module-loader");

const resourcesManifest = require("../extension/modules/resources/module.json");
const resourcesFactory = require("../extension/modules/resources/index.js");
const combatManifest = require("../extension/modules/combat/module.json");
const combatFactory = require("../extension/modules/combat/index.js");
const weatherManifest = require("../extension/modules/weather/module.json");
const weatherFactory = require("../extension/modules/weather/index.js");

function section(title) {
  console.log("\n=== " + title + " ===");
}

function getCombatGold(state) {
  return state.getOwnState("combat").lastKnownGold;
}

function getResourcesGold(state) {
  return state.getOwnState("resources").gold;
}

// --- WITH weather ---
section("TEST 1: All three modules loaded");

const state1 = new StateManager();
const loader1 = new ModuleLoader(state1, new EventBus());
loader1.loadAll([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
  { manifest: weatherManifest, factory: weatherFactory },
]);

const gold1 = getResourcesGold(state1);
const combatGold1 = getCombatGold(state1);
const weatherLoaded = loader1.loaded.has("weather");
console.log(`\nresources.gold:        ${gold1}`);
console.log(`combat.lastKnownGold:  ${combatGold1}`);
console.log(`weather loaded:        ${weatherLoaded}`);

// --- WITHOUT weather ---
section("TEST 2: Weather removed");

const state2 = new StateManager();
const loader2 = new ModuleLoader(state2, new EventBus());
loader2.loadAll([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
  // weather deliberately absent
]);

const gold2 = getResourcesGold(state2);
const combatGold2 = getCombatGold(state2);
const weatherAbsent = !loader2.loaded.has("weather");
console.log(`\nresources.gold:        ${gold2}`);
console.log(`combat.lastKnownGold:  ${combatGold2}`);
console.log(`weather absent:        ${weatherAbsent}`);

// --- Result ---
section("RESULT");

if (gold1 === gold2 && combatGold1 === combatGold2 && weatherLoaded && weatherAbsent) {
  console.log("\n✅ PASS: weather is fully removable, other modules unaffected");
} else {
  console.log("\n❌ FAIL: removing weather changed something it shouldn't have");
}
