// extension/index.js

import { eventSource, event_types } from "../../../../script.js";
import { setExtensionPrompt, extension_prompt_types } from "../../../../scripts/extensions.js";

import { Runtime } from "./core/index.js";
import { PromptManager } from "./core/prompt-manager.js";

import { manifest as resourcesManifest } from "./modules/resources/module.js";
import resourcesFactory from "./modules/resources/index.js";
import { manifest as combatManifest } from "./modules/combat/module.js";
import combatFactory from "./modules/combat/index.js";
import { manifest as weatherManifest } from "./modules/weather/module.js";
import weatherFactory from "./modules/weather/index.js";

export const runtime = new Runtime();

runtime.boot([
  { manifest: resourcesManifest, factory: resourcesFactory },
  { manifest: combatManifest, factory: combatFactory },
  { manifest: weatherManifest, factory: weatherFactory },
]);

const promptManager = new PromptManager(runtime, {
  eventSource,
  event_types,
  setExtensionPrompt,
  extension_prompt_types,
});
promptManager.init();

toastr.success("Runtime booted successfully", "LWH Companion");
