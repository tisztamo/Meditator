/**
 * CLI argument parsing for meditator.js (the mind runner).
 *
 * Parses process.argv once and populates the corresponding process.env keys so
 * that the rest of the codebase — which reads from process.env — works unchanged.
 *
 * Priority for every setting is CLI arg > env var > default, because the config
 * modules already implement that order.  We only set process.env here when a CLI
 * flag wins, leaving the env var untouched when it was not provided on the command
 * line so that env vars and defaults still apply.
 *
 * Secrets (API keys, tokens, passwords) are intentionally excluded from the CLI.
 */

// ------------------------------------------------------------------ helpers

function findArg(argv, longFlag, shortFlag) {
  let idx = argv.indexOf(longFlag);
  if (idx === -1) idx = argv.indexOf(shortFlag);
  return idx;
}

function getArgValue(argv, longFlag, shortFlag) {
  const idx = findArg(argv, longFlag, shortFlag);
  return idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith("-")
    ? argv[idx + 1]
    : undefined;
}

function hasFlag(argv, longFlag, shortFlag) {
  return findArg(argv, longFlag, shortFlag) !== -1;
}

// ------------------------------------------------------------------ parse

export function parseMeditatorCLI() {
  const argv = process.argv;

  // --help / -h — always first
  if (argv.includes("--help") || argv.includes("-h")) {
    printMeditatorHelp();
    process.exit(0);
  }

  // --dry-run
  if (hasFlag(argv, "--dry-run", undefined)) {
    process.env.MEDITATOR_DRY_RUN = "1";
  }

  // --mind-name <name>
  const mindName = getArgValue(argv, "--mind-name", undefined);
  if (mindName !== undefined) {
    process.env.MEDITATOR_MIND_NAME = mindName;
  }

  // --origin <text>
  const origin = getArgValue(argv, "--origin", "-o");
  if (origin !== undefined) {
    process.env.MEDITATOR_ORIGIN = origin;
  }

  // --voice-model <ref>
  const voiceModel = getArgValue(argv, "--voice-model", undefined);
  if (voiceModel !== undefined) {
    process.env.MEDITATOR_VOICE_MODEL = voiceModel;
  }

  // --utility-model <ref>
  const utilityModel = getArgValue(argv, "--utility-model", undefined);
  if (utilityModel !== undefined) {
    process.env.MEDITATOR_UTILITY_MODEL = utilityModel;
  }

  // --max-concurrency <n>
  const maxConcurrency = getArgValue(argv, "--max-concurrency", undefined);
  if (maxConcurrency !== undefined) {
    process.env.MEDITATOR_MAX_CONCURRENCY = maxConcurrency;
  }

  // --stream-stall-ms <ms>
  const stallMs = getArgValue(argv, "--stream-stall-ms", undefined);
  if (stallMs !== undefined) {
    process.env.LLM_STREAM_STALL_MS = stallMs;
  }

  // --debug-prompts [<dir>]
  if (hasFlag(argv, "--debug-prompts", undefined)) {
    const debugPromptsDir = getArgValue(argv, "--debug-prompts", undefined);
    process.env.MEDITATOR_DEBUG_PROMPTS = debugPromptsDir !== undefined ? debugPromptsDir : "1";
  }

  // --sandbox-backend <backend>
  const sandboxBackend = getArgValue(argv, "--sandbox-backend", undefined);
  if (sandboxBackend !== undefined) {
    process.env.MEDITATOR_SANDBOX_BACKEND = sandboxBackend;
  }

  // --dom-inspect <mode>
  const domInspect = getArgValue(argv, "--dom-inspect", undefined);
  if (domInspect !== undefined) {
    process.env.MEDITATOR_DOM_INSPECT = domInspect;
  }

  // --force-transient
  if (hasFlag(argv, "--force-transient", undefined)) {
    process.env.MEDITATOR_FORCE_TRANSIENT = "1";
  }

  // --stdin
  if (hasFlag(argv, "--stdin", undefined)) {
    process.env.MEDITATOR_STDIN = "1";
  }

  // --image-model <model>
  const imageModel = getArgValue(argv, "--image-model", undefined);
  if (imageModel !== undefined) {
    process.env.OPENAI_IMAGE_MODEL = imageModel;
  }

  // --image-size <size>
  const imageSize = getArgValue(argv, "--image-size", undefined);
  if (imageSize !== undefined) {
    process.env.OPENAI_IMAGE_SIZE = imageSize;
  }

  // --image-format <format>
  const imageFormat = getArgValue(argv, "--image-format", undefined);
  if (imageFormat !== undefined) {
    process.env.OPENAI_IMAGE_FORMAT = imageFormat;
  }
}

// ------------------------------------------------------------------ help

function printMeditatorHelp() {
  console.log(`Meditator — mind runner

Usage:
  bun meditator.js -a <architecture.archml> [options]

Required:
  -a, --architecture-file <path>   Path to the .archml architecture file

Options:
  --dry-run                        Offline stub mode — no network, no cost
  --mind-name <name>               Override the mind's name at wake-time
                                   (env: MEDITATOR_MIND_NAME)
  -o, --origin <text>              Override the origin story / seed of thought
                                   (env: MEDITATOR_ORIGIN)
  --voice-model <ref>              Override the "voice" model role
                                   (env: MEDITATOR_VOICE_MODEL)
  --utility-model <ref>            Override the "utility" model role
                                   (env: MEDITATOR_UTILITY_MODEL)
  -mc, --models-config <path>      Path to models.yaml
                                   (env: MEDITATOR_MODELS_CONFIG)
  -mp, --model-profile <name>      Model profile name (cloud, local-dev, ...)
                                   (env: MEDITATOR_MODEL_PROFILE)
  -p, --mind-components-path <dir> Additional custom components directory
                                   (env: MIND_COMPONENTS_PATH)
  --max-concurrency <n>            Max concurrent non-streamed LLM requests
                                   (default: 4; env: MEDITATOR_MAX_CONCURRENCY)
  --stream-stall-ms <ms>           Stream inactivity timeout in milliseconds
                                   (default: 30000; env: LLM_STREAM_STALL_MS)
  --debug-prompts [<dir>]          Dump every prompt to disk. No arg =
                                   <cwd>/debug/prompts. Give a path for custom.
                                   (env: MEDITATOR_DEBUG_PROMPTS)
  --sandbox-backend <backend>      Force sandbox backend: bwrap | unshare | none
                                   (default: auto-detect; env: MEDITATOR_SANDBOX_BACKEND)
  --dom-inspect <mode>             Set to "full" for raw jsdom dumps in logs
                                   (default: compact; env: MEDITATOR_DOM_INSPECT)
  --force-transient                Allow waking a transient mind with existing
                                   memory (testing exception)
                                   (env: MEDITATOR_FORCE_TRANSIENT)
  --stdin                          Enable stdin console input even when not a TTY
                                   (env: MEDITATOR_STDIN)
  --image-model <model>            Override the OpenAI image generation model
                                   (default: gpt-image-1; env: OPENAI_IMAGE_MODEL)
  --image-size <size>              Override image size, e.g. 1024x1024
                                   (default: 1024x1024; env: OPENAI_IMAGE_SIZE)
  --image-format <format>          Override image output format: png | jpeg | webp
                                   (default: png; env: OPENAI_IMAGE_FORMAT)
  --debug[=<module>]               Enable debug logging ("all" or module name)
  -h, --help                       Show this help

Examples:
  bun meditator.js -a architecture/resident.archml
  bun meditator.js -a architecture/lab/seedling.archml --dry-run
  bun meditator.js -a architecture/lab/seedling.archml --mind-name "emma-3" --origin "You are a gardener..."
  MEDITATOR_DRY_RUN=1 bun meditator.js -a architecture/resident.archml --debug=all

Notes:
  Secrets (API keys, tokens) must be set via environment variables only.
  CLI flags take priority over environment variables, which take priority over defaults.
  Custom components: drop mFoo.js into a components/ directory beside your .archml and
  <m-foo> loads from there — overriding a built-in of the same name (a shadow is logged).
  Precedence: -p, then that components/ dir, then MIND_COMPONENTS_PATH, then built-ins.
`);
}
