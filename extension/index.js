// extension/index.js
// SillyTavern extension entry point.

import { Runtime } from "./core/index.js";
import { PromptManager } from "./core/prompt-manager.js";

import { manifest as resourcesManifest } from "./modules/resources/module.js";
import resourcesFactory from "./modules/resources/index.js";
import { manifest as combatManifest } from "./modules/combat/module.js";
import combatFactory from "./modules/combat/index.js";
import { manifest as weatherManifest } from "./modules/weather/module.js";
import weatherFactory from "./modules/weather/index.js";

// Boot the Runtime.
export const runtime = new Runtime();

runtime.boot([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
  { manifest: weatherManifest, factory: weatherFactory },
]);

// Start injecting state into prompts.
const promptManager = new PromptManager(runtime);
promptManager.init();

toastr.success("Runtime booted successfully", "LWH Companion");
