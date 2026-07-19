// extension/core/delta-processor.js
//
// Extracts an <lwh-delta>{...}</lwh-delta> block from AI-authored text
// and applies it to the Runtime by routing each key to the matching
// module's own applyDelta() method. Modules interpret their own delta
// shape (numeric = add, boolean = overwrite, etc) — this file never
// touches module state directly, matching the write-isolation rule.
//
// NOTE: tag uses a hyphen, not an underscore. An underscore version
// (lwh_delta) got corrupted by SillyTavern's Markdown renderer, which
// interpreted the underscores as emphasis syntax and mangled the tag
// on display (raw stored text was fine, only the rendered HTML broke).

const DELTA_REGEX = /<lwh-delta>([\s\S]*?)<\/lwh-delta>/;
// Matches an opening tag with no matching close — e.g. the reply got
// cut off by a max-response-length limit mid-block.
const DANGLING_OPEN_REGEX = /<lwh-delta>[\s\S]*$/;

export function extractDelta(text) {
  const match = text.match(DELTA_REGEX);

  if (match) {
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

  if (DANGLING_OPEN_REGEX.test(text)) {
    console.warn(
      "[DeltaProcessor] Dangling/truncated <lwh-delta> tag — stripped, delta lost this turn. Consider raising max response length."
    );
    const cleanText = text.replace(DANGLING_OPEN_REGEX, "").trim();
    return { delta: null, cleanText, truncated: true };
  }

  return { delta: null, cleanText: text };
}

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
