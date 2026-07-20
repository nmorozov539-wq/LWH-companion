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

// NOTE: content is barred from containing another literal "<lwh-delta>".
// Without this, a non-greedy match still spans from the FIRST open tag
// to the FIRST close tag it finds — so if the model emits two attempts
// in one reply (e.g. drafts a delta, revises it, forgets to close the
// first one), the regex swallows both into one invalid JSON blob and
// the real, well-formed delta is lost. This forces the match to start
// at the last open tag before a close tag instead.
const DELTA_REGEX = /<lwh-delta>((?:(?!<lwh-delta>)[\s\S])*?)<\/lwh-delta>/;
// Matches an opening tag with no matching close — e.g. the reply got
// cut off by a max-response-length limit mid-block.
const DANGLING_OPEN_REGEX = /<lwh-delta>[\s\S]*$/;

export function extractDelta(text) {
  const match = text.match(DELTA_REGEX);

  if (match) {
    // Remove the matched pair, then sweep any leftover abandoned
    // "<lwh-delta>..." fragments (e.g. an earlier unclosed draft the
    // model left behind) so they don't show up as broken text in chat.
    const cleanText = text
      .replace(DELTA_REGEX, "")
      .replace(/<lwh-delta>[^<]*/g, "")
      .trim();

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
