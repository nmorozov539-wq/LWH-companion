// tests/render-prompt.js
//
// Simulates what the Runtime will eventually inject into a SillyTavern prompt.
// Prints the full context block so we can visually verify it looks sane
// before building the real Prompt Manager.

const { StateManager } = require("../extension/core/state-manager");
const { EventBus } = require("../extension/core/event-bus");
const { ModuleLoader } = require("../extension/core/module-loader");

const resourcesManifest = require("../extension/modules/resources/module.json");
const resourcesFactory = require("../extension/modules/resources/index.js");
const combatManifest = require("../extension/modules/combat/module.json");
const combatFactory = require("../extension/modules/combat/index.js");

// Boot the runtime
const state = new StateManager();
const events = new EventBus();
const loader = new ModuleLoader(state, events);
loader.loadAll([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
]);

// Serialize to contract
const contract = state.toContract();

// This is what the Prompt Manager will inject into the prompt.
// The fence + tag gives the LLM a clear delimiter without ambiguity.
const injected = `<state>
${JSON.stringify(contract, null, 2)}
</state>`;

console.log("=== INJECTED STATE BLOCK ===\n");
console.log(injected);
console.log("\n=== PRESET FRAGMENT (would follow in the system prompt) ===\n");
console.log(require("fs").readFileSync("preset/fragment.txt", "utf8"));
