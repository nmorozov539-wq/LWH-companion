// extension/core/delta-processor.js
//
// Extracts an <lwh_delta>{...}</lwh_delta> block from AI-authored text
// and applies it to the Runtime by routing each key to the matching
// module's own applyDelta() method. Modules interpret their own delta
// shape (numeric = add, boolean = overwrite, etc) — this file never
// touches module state directly, matching the write-isolation rule.

const DELTA_REGEX = /<lwh_delta>([\s\S]*?)<\/lwh_delta>/;

// Pulls the delta out of raw text. Returns the parsed object (or null
// if absent/malformed) and the text with the block stripped out, so
// the raw JSON never has to be shown to the user.
export function extractDelta(text) {
  const match = text.match(DELTA_REGEX);
  if (!match) {
    return { delta: null, cleanText: text };
  }

  const cleanText = text.replace(DELTA_REGEX, "").trim();

  let delta;
  try {
    delta = JSON.parse(match[1]);
  } catch (err) {
    console.error("[DeltaProcessor] Malformed delta JSON:", err.message);
    return { delta: null, cleanText };
  }

  return { delta, cleanText };
}

// Routes each top-level key in the delta (e.g. "resources", "combat")
// to that module's own applyDelta(). Missing modules or modules without
// applyDelta are skipped gracefully, never thrown.
export function applyDelta(runtime, delta) {
  if (!delta) return;

  for (const [moduleId, moduleDelta] of Object.entries(delta)) {
    const instance = runtime.loader.loaded.get(moduleId);
    if (!instance) {
      console.warn(`[DeltaProcessor] No loaded module "${moduleId}", skipping.`);
      continue;
    }
    if (typeof instance.applyDelta !== "function") {
      console.warn(`[DeltaProcessor] Module "${moduleId}" has no applyDelta(), skipping.`);
      continue;
    }
    instance.applyDelta(moduleDelta);
  }
}
