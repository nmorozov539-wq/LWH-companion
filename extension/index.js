// extension/index.js
// SillyTavern extension entry point.

import { Runtime } from "./core/index.js";
import { PromptManager } from "./core/prompt-manager.js";
import { MessageHook } from "./core/message-hook.js";

import { manifest as resourcesManifest } from "./modules/resources/module.js";
import resourcesFactory from "./modules/resources/index.js";
import { manifest as combatManifest } from "./modules/combat/module.js";
import combatFactory from "./modules/combat/index.js";
import { manifest as weatherManifest } from "./modules/weather/module.js";
import weatherFactory from "./modules/weather/index.js";

export let runtime;

try {
  runtime = new Runtime();

  runtime.boot([
    { manifest: resourcesManifest, factory: resourcesFactory },
    { manifest: combatManifest, factory: combatFactory },
    { manifest: weatherManifest, factory: weatherFactory },
  ]);

  const promptManager = new PromptManager(runtime);
  promptManager.init();

  const messageHook = new MessageHook(runtime, promptManager);
  messageHook.init();

  const { eventSource, event_types } = SillyTavern.getContext();
  eventSource.on(event_types.APP_READY, () => {
    toastr.success("Runtime booted successfully", "LWH Companion");
  });
} catch (err) {
  console.error("[LWH Companion] Boot failed:", err);
  alert("LWH ERROR: " + err.message);
}
