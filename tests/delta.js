// tests/delta.js
//
// Proves extractDelta + applyDelta work correctly:
// 1. Normal delta updates the right module via its own applyDelta()
// 2. The <lwh-delta> block is stripped from visible text
// 3. Malformed JSON doesn't crash, just gets skipped
// 4. A delta targeting a module that doesn't exist doesn't crash

import { Runtime } from "../extension/core/index.js";
import { extractDelta, applyDelta } from "../extension/core/delta-processor.js";

import { manifest as resourcesManifest } from "../extension/modules/resources/module.js";
import resourcesFactory from "../extension/modules/resources/index.js";
import { manifest as combatManifest } from "../extension/modules/combat/module.js";
import combatFactory from "../extension/modules/combat/index.js";

function section(title) {
  console.log("\n=== " + title + " ===");
}

const runtime = new Runtime();
runtime.boot([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
]);

// --- TEST 1: normal delta ---
section("TEST 1: Normal delta (gold -5, combat starts)");

const aiText =
  'She tosses you a small pouch. "That should cover it." ' +
  '<lwh-delta>{"resources":{"gold":-5},"combat":{"inProgress":true}}</lwh-delta>';

const { delta, cleanText } = extractDelta(aiText);
applyDelta(runtime, delta);

const gold = runtime.state.getOwnState("resources").gold;
const inProgress = runtime.state.getOwnState("combat").inProgress;

console.log("Clean text:", cleanText);
console.log("Gold after delta:", gold, "(expected 37)");
console.log("Combat inProgress:", inProgress, "(expected true)");

if (gold === 37 && inProgress === true && !cleanText.includes("lwh-delta")) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}

// --- TEST 2: malformed JSON doesn't crash ---
section("TEST 2: Malformed delta JSON");

const badText = 'Something happens. <lwh-delta>{not valid json}</lwh-delta>';
const result2 = extractDelta(badText);

console.log("Delta (should be null):", result2.delta);
console.log("Clean text still stripped:", result2.cleanText);

if (result2.delta === null && !result2.cleanText.includes("lwh-delta")) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}

// --- TEST 3: delta targets a module that doesn't exist ---
section("TEST 3: Delta targets unknown module");

let threw = false;
try {
  applyDelta(runtime, { nonexistent_module: { foo: 1 } });
} catch (err) {
  threw = true;
}

console.log("Threw an error:", threw, "(expected false)");
if (!threw) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}

// --- TEST 4: no delta present at all ---
section("TEST 4: Text with no delta block");

const plainText = "Just narration, nothing hidden here.";
const result4 = extractDelta(plainText);

console.log("Delta:", result4.delta, "(expected null)");
console.log("Clean text unchanged:", result4.cleanText === plainText);

if (result4.delta === null && result4.cleanText === plainText) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}

// --- TEST 5: genuinely truncated — JSON itself cut off mid-object ---
section("TEST 5: Genuine truncation (braces never balance)");

const truncatedText =
  'Ten gold coins clatter onto the table. ' +
  '<lwh-delta>{"resources":{"gold":10';

const result5 = extractDelta(truncatedText);

console.log("Delta (should be null):", result5.delta);
console.log("Clean text:", result5.cleanText);
console.log("Truncated flag:", result5.truncated);

if (
  result5.delta === null &&
  !result5.cleanText.includes("lwh-delta") &&
  !result5.cleanText.includes("{") &&
  result5.truncated === true
) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}

section("Done");

// --- TEST 6: model emits an abandoned/unclosed draft before the real one ---
section("TEST 6: Double <lwh-delta> open, only later one closed");

const doubleOpenText =
  '"Done," he says. ' +
  '<lwh-delta>{"resources":{"gold":-10}} ' +
  '<lwh-delta>{"resources":{"gold":-5},"combat":{"inProgress":true}}</lwh-delta>';

const result6 = extractDelta(doubleOpenText);

console.log("Delta:", result6.delta);
console.log("Clean text:", result6.cleanText);

if (
  result6.delta &&
  result6.delta.resources.gold === -5 &&
  result6.delta.combat.inProgress === true &&
  !result6.cleanText.includes("lwh-delta")
) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}

// --- TEST 7: complete valid JSON but model never wrote a closing tag ---
// (the actual failure observed in practice — not a token-limit cutoff,
// the model just doesn't reliably reproduce custom closing syntax)
section("TEST 7: Valid JSON, no closing tag at all");

const noCloseTagText =
  'The coins vanish into his pocket. ' +
  '<lwh-delta>{"resources":{"gold":10}}';

const result7 = extractDelta(noCloseTagText);

console.log("Delta:", result7.delta, "(expected gold: 10)");
console.log("Clean text:", result7.cleanText);

if (
  result7.delta &&
  result7.delta.resources.gold === 10 &&
  !result7.cleanText.includes("lwh-delta") &&
  !result7.cleanText.includes("{")
) {
  console.log("✅ PASS");
} else {
  console.log("❌ FAIL");
}
