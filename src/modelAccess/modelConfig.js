import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { getModelsConfigPath, getModelProfile } from "../config/modelLoading.js";
import { logger } from "../infrastructure/logger.js";

const log = logger("modelConfig.js");

const ROLES = ["voice", "utility"];
const ROLE_ENV = {
  voice: "MEDITATOR_VOICE_MODEL",
  utility: "MEDITATOR_UTILITY_MODEL",
};

const HARDCODED_FALLBACKS = {
  voice: { provider: "openrouter", model: "qwen/qwen3.6-35b-a3b" },
  utility: { provider: "openrouter", model: "qwen/qwen3.5-9b" },
};

let config = null;
let activeProfile = null;

/** Interpolate ${VAR} or ${VAR:default} in config string values. */
export function interpolateEnv(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([^}:]+)(?::([^}]*))?\}/g, (_, name, def) => {
    const v = process.env[name];
    if (v != null && v !== "") return v;
    if (def !== undefined) return def;
    return "";
  });
}

function interpolateDeep(obj) {
  if (typeof obj === "string") return interpolateEnv(obj);
  if (Array.isArray(obj)) return obj.map(interpolateDeep);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = interpolateDeep(v);
    return out;
  }
  return obj;
}

function isLegacyModelId(ref) {
  if (!ref || typeof ref !== "string") return false;
  if (ref.startsWith("local/")) return true;
  if (ref.includes("/")) return true;
  return false;
}

function legacySpec(ref) {
  if (ref.startsWith("local/")) {
    return { provider: "local", model: ref.slice("local/".length) };
  }
  return { provider: "openrouter", model: ref };
}

function presetSpec(name) {
  const preset = config?.presets?.[name];
  if (!preset) throw new Error(`Unknown model preset "${name}"`);
  return { provider: preset.provider, model: preset.model };
}

function roleSpec(name) {
  const role = config?.roles?.[name];
  if (!role) throw new Error(`Unknown model role "${name}"`);
  return { provider: role.provider, model: role.model };
}

function profileRoleRef(role) {
  const profile = config?.profiles?.[activeProfile];
  return profile?.roles?.[role] ?? role;
}

function resolveRef(ref, roleHint) {
  if (!ref) {
    if (roleHint && ROLES.includes(roleHint)) {
      const mapped = profileRoleRef(roleHint);
      if (mapped !== roleHint) return resolveRef(mapped, roleHint);
      return roleSpec(roleHint);
    }
    throw new Error("Model reference is empty");
  }

  if (isLegacyModelId(ref)) return legacySpec(ref);

  if (config?.presets?.[ref]) return presetSpec(ref);

  if (config?.roles?.[ref]) {
    const mapped = profileRoleRef(ref);
    if (mapped !== ref) return resolveRef(mapped, ref);
    return roleSpec(ref);
  }

  throw new Error(`Unknown model reference "${ref}"`);
}

function mergeProviderOptions(spec) {
  const providerCfg = config?.providers?.[spec.provider] || {};
  const thinking = providerCfg.thinking;
  return {
    ...spec,
    baseURL: providerCfg.baseURL,
    apiKey: providerCfg.apiKey,
    thinking: thinking === "1" || thinking === "true" || thinking === true,
  };
}

/**
 * Load and parse models.yaml. Call once at startup.
 */
export async function loadModelConfig() {
  const path = getModelsConfigPath();
  let raw;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read models config: ${path}. ${error.message}`);
  }

  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid models config: ${path}`);
  }

  config = interpolateDeep(parsed);
  activeProfile = getModelProfile(config.defaultProfile);

  if (!config.profiles?.[activeProfile]) {
    throw new Error(`Unknown model profile "${activeProfile}" in ${path}`);
  }

  log.info(`model config loaded: ${path}, profile="${activeProfile}"`);
  return config;
}

/**
 * Resolve a model reference (role name, preset, legacy id, or omitted) to a provider spec.
 * @param {string|null|undefined} ref - archml attr value or env override
 * @param {"voice"|"utility"} [role] - tier hint when ref is omitted
 * @returns {{ provider: string, model: string, baseURL?: string, apiKey?: string, thinking?: boolean }}
 */
export function resolveModelRef(ref, role) {
  const envOverride = role && ROLE_ENV[role] ? process.env[ROLE_ENV[role]] : null;
  const effectiveRef = envOverride || ref || null;

  try {
    const spec = resolveRef(effectiveRef, role);
    return mergeProviderOptions(spec);
  } catch (error) {
    if (role && HARDCODED_FALLBACKS[role] && !effectiveRef) {
      log.warn(`model resolve failed for role "${role}": ${error.message} — using hardcoded fallback`);
      return mergeProviderOptions(HARDCODED_FALLBACKS[role]);
    }
    throw error;
  }
}

/** Resolved spec for a role with no archml override (profile defaults + env). */
export function modelForRole(role) {
  const normalized = role === "stream" ? "voice" : role;
  return resolveModelRef(null, normalized);
}

/** For studio/logging — what each role resolves to under the active profile. */
export function getResolvedRoles() {
  const out = {};
  for (const role of ROLES) {
    const spec = resolveModelRef(null, role);
    out[role] = {
      provider: spec.provider,
      model: spec.model,
      label: spec.provider === "local" ? `local/${spec.model}` : spec.model,
    };
  }
  return { profile: activeProfile, roles: out };
}

export function getActiveProfile() {
  return activeProfile;
}
