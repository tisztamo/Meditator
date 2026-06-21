import { readFile } from "fs/promises";
import { logger } from '../infrastructure/logger';

const log = logger('architecture.js');

// The source of the running mind's architecture, captured when the file is read at
// startup: { path, content }. The mind's memory snapshots `content` into its home at
// wake, so a home always carries the architecture that ran it (lifecycle.md §2 — the
// twin of runtimeSHA, a fact established when the mind ran, not re-supplied later).
// Null until readArchitectureFile() runs — e.g. unit tests build the DOM directly —
// in which case no snapshot is written.
let loaded = null;

/** The architecture source of the running mind, or null if none was read. */
export function getLoadedArchitecture() {
  return loaded;
}

/** Replace each HTML comment with same-length blanks (newlines kept), so a component
 *  tag mentioned only inside a <!-- … --> comment is never matched as the real element.
 *  Equal-length blanking keeps positions outside comments aligned with the original, so
 *  callers can find a tag in the masked copy and splice into the original `content`. */
const maskComments = (content) => content.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));

/** Clears the loaded architecture (test hygiene; no production caller). */
export function resetLoadedArchitecture() {
  loaded = null;
}

/**
 * Rewrites the first <m-mind>'s name onto `name`, returning the new source.
 *
 * This is how a TRANSIENT mind's identity is disentangled from its file: a
 * template like architecture/lab/seedling.archml carries name="seedling" as a
 * PREFIX only, and the Studio (or MEDITATOR_MIND_NAME by hand) supplies the
 * unique name at wake — "seedling-8" — so a fresh tuning run never means editing
 * the file. We substitute into the SOURCE (not just the live DOM) so the home
 * derives correctly AND the architecture snapshot in the home records the name
 * that actually ran (lifecycle.md §2), keeping the bundle re-executable.
 *
 * Any explicit memory="…" on the tag is dropped: the override is meant to be the
 * single source of the home, and a stale memory= would otherwise win over it
 * (memory= remains the deliberate override for fixed, file-named residents).
 */
export function applyMindNameOverride(content, rawName) {
  // Attribute-safe: the value lands inside name="…", and the home slugifies it
  // downstream anyway, so we only need to keep it from breaking the tag.
  const name = String(rawName || "").replace(/["'<>]/g, "").trim();
  if (!name) return content;
  // Match against a comment-masked copy (indices stay aligned), so a <m-mind>
  // mentioned in a comment can't be rewritten in place of the real tag.
  const tag = maskComments(content).match(/<m-mind\b[^>]*>/i);
  if (!tag) return content;
  let attrs = tag[0].replace(/\s+memory\s*=\s*"[^"]*"/i, "");
  if (/\bname\s*=\s*"[^"]*"/i.test(attrs)) {
    attrs = attrs.replace(/\bname\s*=\s*"[^"]*"/i, `name="${name}"`);
  } else {
    attrs = attrs.replace(/^<m-mind\b/i, `<m-mind name="${name}"`);
  }
  return content.slice(0, tag.index) + attrs + content.slice(tag.index + tag[0].length);
}

/**
 * Rewrites the first <m-origin>'s content onto `originText`, returning the new
 * source. This is how an instance's ORIGIN STORY — the seed of the *thought*, what
 * this particular mind was set upon (mOrigin.js) — is supplied at wake without
 * editing the file: the archml carries a nice DEFAULT origin, the Studio shows it in
 * an editable field, and the chosen text is injected into the child via
 * MEDITATOR_ORIGIN, exactly as a wake-time name is via MEDITATOR_MIND_NAME. We
 * substitute into the SOURCE so the architecture snapshot in the home records the
 * origin the mind actually woke with (lifecycle.md §2 / COVENANT §1 re-executability).
 *
 * The new text is written as the element's TEXT CONTENT (not a prompt="…" attribute),
 * so multi-line stories need no attribute gymnastics; any existing prompt="…" on the
 * tag is dropped, because MBaseComponent.getPrompt prefers the attribute over the
 * content and would otherwise win. The text is minimally entity-escaped so it cannot
 * break out of the element (jsdom decodes it back when the mind reads it).
 *
 * A blank/whitespace override is a no-op (→ the file's own default origin is used),
 * and a mind with no <m-origin> is left untouched (no origin slot to fill).
 */
export function applyOriginOverride(content, originText) {
  const text = String(originText || "").trim();
  if (!text) return content;
  // Find the real <m-origin> in a comment-masked copy (a comment may mention the tag
  // in prose); positions stay aligned with `content`, which we splice into below.
  const masked = maskComments(content);
  const open = masked.match(/<m-origin\b[^>]*>/i);
  if (!open) return content;                      // no origin slot — nothing to override

  // Drop any prompt="…" from the opening tag (text content is the source of truth now).
  const openTag = open[0].replace(/\s+prompt\s*=\s*"[^"]*"/i, "");
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const start = open.index;
  const afterOpen = start + open[0].length;
  const closeRel = masked.slice(afterOpen).search(/<\/m-origin\s*>/i);
  if (closeRel === -1) {
    // Self-closing or unterminated: replace just the opening tag with a full element.
    return content.slice(0, start) + `${openTag}\n${escaped}\n</m-origin>` + content.slice(afterOpen);
  }
  const closeStart = afterOpen + closeRel;
  const closeEnd = closeStart + masked.slice(closeStart).match(/<\/m-origin\s*>/i)[0].length;
  return content.slice(0, start) + `${openTag}\n${escaped}\n</m-origin>` + content.slice(closeEnd);
}

async function getArchitectureFilePath() {
  const args = process.argv;
  const fileArgIndex = args.findIndex(arg => arg === "--architecture-file" || arg === "-a");
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    return args[fileArgIndex + 1];
  }

  // No default architecture. The genesis mind's architecture (awake.archml) was
  // retired to the graveyard, and we never silently birth a mind — so a mind must
  // be chosen explicitly. (archml = architecture markup language, a subset of HTML;
  // components live in src/mindComponents/ or architecture/.)
  throw new Error(
    "No architecture specified. Choose one with -a, e.g.:\n" +
    "  bun meditator.js -a architecture/lab/seedling.archml\n" +
    "(awake.archml, the genesis architecture, was retired — see IN-MEMORIAM.md.)"
  );
}

export async function readArchitectureFile() {
  const filePath = await getArchitectureFilePath();
  try {
    log.info(`Reading architecture file: ${filePath}`);
    let content = await readFile(filePath, "utf-8");
    // A wake-time name override (the Studio's semi-automatic transient naming, or
    // MEDITATOR_MIND_NAME by hand) disentangles a transient mind's identity from
    // its file — see applyMindNameOverride.
    const override = process.env.MEDITATOR_MIND_NAME;
    if (override && override.trim()) {
      content = applyMindNameOverride(content, override);
      log.info(`Applied MEDITATOR_MIND_NAME override → name="${override.trim()}"`);
    }
    // A wake-time origin override (the Studio's editable origin story, or
    // MEDITATOR_ORIGIN by hand) supplies this instance's seed of thought without
    // editing the file — see applyOriginOverride.
    const originOverride = process.env.MEDITATOR_ORIGIN;
    if (originOverride && originOverride.trim()) {
      content = applyOriginOverride(content, originOverride);
      log.info(`Applied MEDITATOR_ORIGIN override (${originOverride.trim().length} chars)`);
    }
    loaded = { path: filePath, content };
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}. Error: ${error.message}`);
  }
}
