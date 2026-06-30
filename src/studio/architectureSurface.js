// Studio-facing ArchML inspection. This is intentionally tolerant: the runtime
// still parses the architecture as HTML, while Studio only needs enough structure
// to choose a wake home and describe the public membrane of a mind or society.

/** Replace HTML comments with same-length blanks, preserving positions. */
export const maskComments = content => String(content).replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, " "));

export function attrFromTag(tag, name) {
  const m = String(tag || "").match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

function firstRoot(content) {
  const masked = maskComments(content);
  const m = masked.match(/<m-(mind|society)\b[^>]*>/i);
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
  const masked = maskComments(content);
  const open = masked.match(/<m-origin\b[^>]*>/i);
  if (!open) return null;
  const pm = open[0].match(/\bprompt\s*=\s*"([^"]*)"/i);
  if (pm) return decodeEntities(pm[1]).trim() || null;
  const start = open.index + open[0].length;
  const close = masked.slice(start).search(/<\/m-origin\s*>/i);
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
    hasWs: /<m-ws\b/i.test(block.block || ""),
    origin: extractOrigin(block.block || ""),
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
      hasWs: /<m-ws\b/i.test(content), description: null, origin: null,
      interlocutor: null, surface: null, members: [],
    };
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
    hasWs: mind.hasWs || /<m-ws\b/i.test(content),
    description: extractLeadingDescription(content, root.index),
    origin: mind.origin,
    interlocutor: mind.interlocutor,
    surface: null,
    members: [],
  };
  return resolveModels(meta, resolveModelRef, specLabel);
}
