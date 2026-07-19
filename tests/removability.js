// tests/removability.js
//
// Proves that adding or removing the weather module has zero effect
// on resources and combat.

import { Runtime } from "../extension/core/index.js";
import { manifest as resourcesManifest } from "../extension/modules/resources/module.js";
import resourcesFactory from "../extension/modules/resources/index.js";
import { manifest as combatManifest } from "../extension/modules/combat/module.js";
import combatFactory from "../extension/modules/combat/index.js";
import { manifest as weatherManifest } from "../extension/modules/weather/module.js";
import weatherFactory from "../extension/modules/weather/index.js";

function section(title) {
  console.log("\n=== " + title + " ===");
}

function getResourcesGold(state) {
  return state.getOwnState("resources").gold;
}

function getCombatInProgress(state) {
  return state.getOwnState("combat").inProgress;
}

// --- WITH weather ---
section("TEST 1: All three modules loaded");

const state1 = new Runtime();
state1.boot([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
  { manifest: weatherManifest, factory: weatherFactory },
]);

const gold1 = getResourcesGold(state1.state);
const combat1 = getCombatInProgress(state1.state);
const weatherLoaded = state1.loader.loaded.has("weather");
console.log(`\nresources.gold:       ${gold1}`);
console.log(`combat.inProgress:    ${combat1}`);
console.log(`weather loaded:       ${weatherLoaded}`);

// --- WITHOUT weather ---
section("TEST 2: Weather removed");

const state2 = new Runtime();
state2.boot([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
]);

const gold2 = getResourcesGold(state2.state);
const combat2 = getCombatInProgress(state2.state);
const weatherAbsent = !state2.loader.loaded.has("weather");
console.log(`\nresources.gold:       ${gold2}`);
console.log(`combat.inProgress:    ${combat2}`);
console.log(`weather absent:       ${weatherAbsent}`);

// --- Result ---
section("RESULT");

if (gold1 === gold2 && combat1 === combat2 && weatherLoaded && weatherAbsent) {
  console.log("\n✅ PASS: weather is fully removable, other modules unaffected");
} else {
  console.log("\n❌ FAIL: removing weather changed something it shouldn't have");
}
