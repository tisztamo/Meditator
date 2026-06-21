/**
 * CLI argument parsing for studio.js (the supervisor).
 *
 * Parses process.argv once and populates the corresponding process.env keys so
 * that the rest of the codebase — which reads from process.env — works unchanged.
 *
 * Priority for every setting is CLI arg > env var > default.
 *
 * Secrets (STUDIO_TOKEN, STUDIO_SESSION_SECRET, API keys) are excluded from the CLI.
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

export function parseStudioCLI() {
  const argv = process.argv;

  // --help / -h — always first
  if (argv.includes("--help") || argv.includes("-h")) {
    printStudioHelp();
    process.exit(0);
  }

  // --port <n>
  const port = getArgValue(argv, "--port", undefined);
  if (port !== undefined) {
    process.env.STUDIO_PORT = port;
  }

  // --voice <0|1>
  const voice = getArgValue(argv, "--voice", undefined);
  if (voice !== undefined) {
    process.env.STUDIO_VOICE = voice;
  }

  // --voice-name <name>
  const voiceName = getArgValue(argv, "--voice-name", undefined);
  if (voiceName !== undefined) {
    process.env.STUDIO_VOICE_NAME = voiceName;
  }

  // --tts-model <model>
  const ttsModel = getArgValue(argv, "--tts-model", undefined);
  if (ttsModel !== undefined) {
    process.env.STUDIO_TTS_MODEL = ttsModel;
  }

  // --stt-model <model>
  const sttModel = getArgValue(argv, "--stt-model", undefined);
  if (sttModel !== undefined) {
    process.env.STUDIO_STT_MODEL = sttModel;
  }

  // --projects <root1>:<root2>,...
  const projects = getArgValue(argv, "--projects", undefined);
  if (projects !== undefined) {
    process.env.MEDITATOR_STUDIO_PROJECTS = projects;
  }
}

// ------------------------------------------------------------------ help

function printStudioHelp() {
  console.log(`Studio — mind supervisor

Usage:
  bun studio.js [options]

Options:
  --port <n>                   HTTP/WebSocket port for the Studio UI
                               (default: 7600; env: STUDIO_PORT)
  --voice <0|1>                Enable or disable Voice Mode entirely
                               (default: enabled with OPENAI_API_KEY; env: STUDIO_VOICE)
  --voice-name <name>          Default TTS voice (alloy, ash, ballad, coral, echo,
                               fable, nova, onyx, sage, shimmer, verse, marin, cedar)
                               (default: marin; env: STUDIO_VOICE_NAME)
  --tts-model <model>          OpenAI model for text-to-speech
                               (default: gpt-4o-mini-tts; env: STUDIO_TTS_MODEL)
  --stt-model <model>          OpenAI model for speech-to-text
                               (default: gpt-4o-transcribe; env: STUDIO_STT_MODEL)
  --projects <roots>           Colon or comma-separated list of external project
                               roots the Studio supervises
                               (env: MEDITATOR_STUDIO_PROJECTS)
  -h, --help                   Show this help

Examples:
  bun studio.js
  bun studio.js --port 8080
  bun studio.js --voice 0
  bun studio.js --voice-name cedar --tts-model gpt-4o-tts
  bun studio.js --projects /path/to/project-a:/path/to/project-b

Notes:
  Secrets (STUDIO_TOKEN, STUDIO_SESSION_SECRET, API keys) must be set via
  environment variables only.
  CLI flags take priority over environment variables, which take priority over defaults.
`);
}
