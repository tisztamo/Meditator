/**
 * Model config path and profile discovery.
 * Priority: CLI arg → env var → default.
 */

const DEFAULT_CONFIG_PATH = "config/models.yaml";

export function getModelsConfigPath() {
  const cliIdx = process.argv.findIndex(arg => arg === "--models-config" || arg === "-mc");
  if (cliIdx !== -1 && process.argv[cliIdx + 1]) {
    return process.argv[cliIdx + 1];
  }
  return process.env.MEDITATOR_MODELS_CONFIG || DEFAULT_CONFIG_PATH;
}

export function getModelProfile(defaultFromConfig) {
  const cliIdx = process.argv.findIndex(arg => arg === "--model-profile" || arg === "-mp");
  if (cliIdx !== -1 && process.argv[cliIdx + 1]) {
    return process.argv[cliIdx + 1];
  }
  return process.env.MEDITATOR_MODEL_PROFILE || defaultFromConfig || "cloud";
}
