// Studio-facing ArchML inspection. This is intentionally tolerant: the runtime
// still parses the architecture as HTML, while Studio only needs enough structure
// to choose a wake home and describe the public membrane of a mind or society.

/** Replace HTML comments with same-length blanks, preserving positions. */
export const maskComments = content => String(content).replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, " "));

/** Does a LIVE <m-ws> membrane exist — not merely one mentioned inside a comment?
 *  Several shipped agents document the optional socket in a comment (e.g.
 *  "to watch in the Studio, add <m-ws …>"); a raw regex would read that as a real
 *  window, so the supervisor would loop forever trying to connect to a port that
 *  never binds and the entity would hang in "waking". Mask comments first. */
export const hasWsTag = content => /<m-ws\b/i.test(maskComments(content));

export function attrFromTag(tag, name) {
  const m = String(tag || "").match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

function firstRoot(content) {
  const masked = maskComments(content);
  const m = masked.match(/<m-(mind|society|agent)\b[^>]*>/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), tag: m[0], index: m.index };
}

function elementBlocks(content, tagName) {
  const masked = maskComments(content);
  const re = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, "ig");
  const out = [];
  let m;
  while ((m = re.exec(masked))) {
    const open = m[0].match(new RegExp(`<${tagName}\\b[^>]*>`, "i"))?.[0] || "";
    out.push({ tag: open, block: content.slice(m.index, m.index + m[0].length), index: m.index });
  }
  return out;
}

function extractLeadingDescription(content, rootIndex) {
  const head = rootIndex >= 0 ? content.slice(0, rootIndex) : content;
  const comment = head.match(/<!--([\s\S]*?)-->/);
  return comment ? comment[1].trim().replace(/\s+/g, " ").slice(0, 200) : null;
}

/** The first <m-origin>'s text in a block: prompt="…", else element text. */
export function extractOrigin(content) {
  return extractSeed(content, "m-origin");
}

/** The first <m-objective>'s text — the agent twin of <m-origin> (the seed of the WORK). */
export function extractObjective(content) {
  return extractSeed(content, "m-objective");
}

/** Shared: the first <tag>'s seed text (prompt="…", else element text). */
function extractSeed(content, tag) {
  const masked = maskComments(content);
  const open = masked.match(new RegExp(`<${tag}\\b[^>]*>`, "i"));
  if (!open) return null;
  const pm = open[0].match(/\bprompt\s*=\s*"([^"]*)"/i);
  if (pm) return decodeEntities(pm[1]).trim() || null;
  const start = open.index + open[0].length;
  const close = masked.slice(start).search(new RegExp(`<\\/${tag}\\s*>`, "i"));
  if (close === -1) return null;
  const inner = content.slice(start, start + close).replace(/<[^>]+>/g, "");
  return decodeEntities(inner).trim() || null;
}

export function decodeEntities(s) {
  return String(s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseMindBlock(block) {
  const tag = block.tag || "";
  return {
    name: attrFromTag(tag, "name"),
    memory: attrFromTag(tag, "memory"),
    model: attrFromTag(tag, "model"),
    utilityModel: attrFromTag(tag, "utilityModel"),
    pace: attrFromTag(tag, "pace"),
    stage: attrFromTag(tag, "stage"),
    interlocutor: attrFromTag(tag, "interlocutor") || null,
    hasWs: hasWsTag(block.block || ""),
    origin: extractOrigin(block.block || ""),
  };
}

/** The public surface of an <m-agent> root — the twin of parseMindBlock. Its seed of
 *  work is the <m-objective> (surfaced as `origin` so the wake form edits it uniformly),
 *  and it carries the loop's budget/stop attributes for display. */
function parseAgentBlock(content, tag) {
  return {
    name: attrFromTag(tag, "name"),
    memory: attrFromTag(tag, "memory"),
    model: attrFromTag(tag, "model"),
    utilityModel: attrFromTag(tag, "utilityModel"),
    stage: attrFromTag(tag, "stage"),
    maxSteps: attrFromTag(tag, "maxSteps"),
    stopWhen: attrFromTag(tag, "stopWhen"),
    hasWs: hasWsTag(content),
    objective: extractObjective(content),
  };
}

function memberPath(member, slot) {
  return member ? `${member}/${slot}` : null;
}

function resolveSocietySurface(societyTag, members) {
  const explicitFace = attrFromTag(societyTag, "external-face") || attrFromTag(societyTag, "face") || attrFromTag(societyTag, "external");
  const explicitEar = attrFromTag(societyTag, "external-ear");
  const explicitMouth = attrFromTag(societyTag, "external-mouth");
  const byName = new Map(members.filter(m => m.name).map(m => [m.name, m]));

  const inferredFace = explicitFace
    || (byName.has("face") ? "face" : null)
    || members.find(m => m.hasWs)?.name
    || members[0]?.name
    || null;

  return {
    face: inferredFace,
    ear: explicitEar || memberPath(inferredFace, "ws"),
    mouth: explicitMouth || memberPath(inferredFace, "voice"),
    declared: !!(explicitFace || explicitEar || explicitMouth),
  };
}

function resolveModels(meta, resolveModelRef, specLabel) {
  if (!resolveModelRef || !specLabel) return meta;
  try { meta.resolvedVoice = specLabel(resolveModelRef(meta.model, "voice")); } catch { meta.resolvedVoice = null; }
  try { meta.resolvedUtility = specLabel(resolveModelRef(meta.utilityModel, "utility")); } catch { meta.resolvedUtility = null; }
  return meta;
}

export function parseArchitecture(content, { resolveModelRef = null, specLabel = null } = {}) {
  const root = firstRoot(content);
  if (!root) {
    return {
      kind: "mind", name: null, memory: null, model: null, utilityModel: null,
      resolvedVoice: null, resolvedUtility: null, pace: null, stage: null,
      hasWs: hasWsTag(content), description: null, origin: null,
      interlocutor: null, surface: null, members: [],
    };
  }

  if (root.kind === "agent") {
    // An agent is the inversion of a mind (agent-loop.md §1): a tool-calling loop, not a
    // stream. It has no <m-origin>/interlocutor/pace; its seed of work is <m-objective>,
    // surfaced as `origin` so the wake form's editable seed field seeds it uniformly (the
    // server maps it to MEDITATOR_OBJECTIVE for an agent). Model refs resolve identically.
    const agent = parseAgentBlock(content, root.tag);
    const meta = {
      kind: "agent",
      name: agent.name,
      memory: agent.memory,
      model: agent.model,
      utilityModel: agent.utilityModel,
      resolvedVoice: null,
      resolvedUtility: null,
      pace: null,
      stage: agent.stage,
      hasWs: agent.hasWs,
      description: extractLeadingDescription(content, root.index),
      origin: agent.objective,
      objective: agent.objective,
      maxSteps: agent.maxSteps,
      stopWhen: agent.stopWhen,
      interlocutor: null,
      surface: null,
      members: [],
    };
    return resolveModels(meta, resolveModelRef, specLabel);
  }

  if (root.kind === "society") {
    const members = elementBlocks(content, "m-mind").map(parseMindBlock);
    const surface = resolveSocietySurface(root.tag, members);
    const publicMember = members.find(m => m.name === surface.face) || members.find(m => m.hasWs) || members[0] || {};
    const meta = {
      kind: "society",
      name: attrFromTag(root.tag, "name") || publicMember.name || "society",
      memory: attrFromTag(root.tag, "memory") || attrFromTag(root.tag, "name") || null,
      model: publicMember.model || null,
      utilityModel: publicMember.utilityModel || null,
      resolvedVoice: null,
      resolvedUtility: null,
      pace: publicMember.pace || null,
      stage: attrFromTag(root.tag, "stage") || publicMember.stage || null,
      hasWs: members.some(m => m.hasWs),
      description: extractLeadingDescription(content, root.index),
      origin: publicMember.origin || null,
      interlocutor: publicMember.interlocutor || null,
      surface,
      members: members.map(m => ({ name: m.name, hasWs: m.hasWs, stage: m.stage || null })),
    };
    return resolveModels(meta, resolveModelRef, specLabel);
  }

  const firstMind = elementBlocks(content, "m-mind")[0] || { tag: root.tag, block: content };
  const mind = parseMindBlock(firstMind);
  const meta = {
    kind: "mind",
    name: mind.name,
    memory: mind.memory,
    model: mind.model,
    utilityModel: mind.utilityModel,
    resolvedVoice: null,
    resolvedUtility: null,
    pace: mind.pace,
    stage: mind.stage,
    hasWs: mind.hasWs || hasWsTag(content),
    description: extractLeadingDescription(content, root.index),
    origin: mind.origin,
    interlocutor: mind.interlocutor,
    surface: null,
    members: [],
  };
  return resolveModels(meta, resolveModelRef, specLabel);
}
