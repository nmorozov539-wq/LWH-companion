// extension/core/delta-processor.js
//
// Extracts an <lwh-delta>{...} block from AI-authored text and applies
// it to the Runtime by routing each key to the matching module's own
// applyDelta() method. Modules interpret their own delta shape (numeric
// = add, boolean = overwrite, etc) — this file never touches module
// state directly, matching the write-isolation rule.
//
// NOTE: tag uses a hyphen, not an underscore. An underscore version
// (lwh_delta) got corrupted by SillyTavern's Markdown renderer, which
// interpreted the underscores as emphasis syntax and mangled the tag
// on display (raw stored text was fine, only the rendered HTML broke).
//
// NOTE: extraction does NOT require a literal closing </lwh-delta> tag.
// Observed repeatedly in practice: models write valid, complete JSON but
// unreliably remember custom closing syntax. JSON is self-delimiting via
// balanced braces, so we scan forward from the opening tag for the
// matching "}" instead of waiting for "</lwh-delta>". This still
// correctly catches genuine truncation (max-response-length cutoff
// mid-object) — if braces never balance before the string ends, that's
// unrecoverable and treated as dangling, same as before. A closing tag
// is consumed if present, but never required.
//
// If multiple "<lwh-delta>" occurrences exist in one reply (model
// drafts, revises, leaves the first attempt unclosed), the LAST
// occurrence is used — earlier abandoned fragments are swept out of the
// display text but never parsed.

const OPEN_TAG = "<lwh-delta>";

// Scans forward from `startIdx` (which must point at a "{") for the
// matching balanced "}", respecting quoted strings and escaped quotes.
// Returns the end index (inclusive) of the match, or -1 if braces never
// balance before the string ends (genuine truncation).
function findBalancedJSONEnd(text, startIdx) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

export function extractDelta(text) {
  const openIdx = text.lastIndexOf(OPEN_TAG);

  if (openIdx === -1) {
    return { delta: null, cleanText: text };
  }

  const jsonStart = text.indexOf("{", openIdx + OPEN_TAG.length);
  const jsonEnd = jsonStart === -1 ? -1 : findBalancedJSONEnd(text, jsonStart);

  if (jsonEnd === -1) {
    console.warn(
      "[DeltaProcessor] Dangling/truncated <lwh-delta> tag — stripped, delta lost this turn. Consider raising max response length."
    );
    const cleanText = text.slice(0, openIdx).trim();
    return { delta: null, cleanText, truncated: true };
  }

  const jsonSlice = text.slice(jsonStart, jsonEnd + 1);

  // Consume an immediately-following closing tag if the model did write one.
  let afterIdx = jsonEnd + 1;
  const closeMatch = text.slice(afterIdx).match(/^\s*<\/lwh-delta>/);
  if (closeMatch) afterIdx += closeMatch[0].length;

  // Remove the matched span, then sweep any leftover abandoned
  // "<lwh-delta>..." fragments (e.g. an earlier unclosed draft the
  // model left behind) so they don't show up as broken text in chat.
  const cleanText = (text.slice(0, openIdx) + text.slice(afterIdx))
    .replace(/<lwh-delta>[^<]*/g, "")
    .trim();

  let delta;
  try {
    delta = JSON.parse(jsonSlice);
  } catch (err) {
    console.error("[DeltaProcessor] Malformed delta JSON:", err.message);
    return { delta: null, cleanText };
  }

  return { delta, cleanText };
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
