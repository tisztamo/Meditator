#!/usr/bin/env bash
# Run one LIVE judge arm of lemma-lab-judge.archml for DURATION_SEC seconds.
#
#   run-judge.sh jev [duration_sec]   System-One comparator (TypeSafe Jev),
#                                     profile local-voice-jev, compareDeadline 2s.
#                                     PRIVACY: the mind's expectation and the
#                                     perception it is graded against leave the box.
#   run-judge.sh llm [duration_sec]   the text comparator on the local model,
#                                     profile local-voice, compareDeadline 8s —
#                                     the control arm, everything on the box.
#
# Same shape as run.sh: a scratch copy of the architecture, a timestamped
# --mind-name so the checked-in home is never touched, one SIGINT at the end.
# The process log goes into the run home, because the per-judgement provenance
# line (engine, pinned model version, latency, cost) is written there and the
# analysis reads it back.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"

# Keys live in ~/.env (TYPESAFE_API_KEY, OPENROUTER_API_KEY, LOCAL_LLM_*), sourced
# by the interactive shell profile but not by a script's. Fill in only what is not
# already exported — an explicit environment always wins — and never echo a value.
load_env() {
  local file="$HOME/.env" line name value
  [[ -r "$file" ]] || return 0
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    name="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    [[ -n "${!name:-}" ]] && continue
    export "$name=$value"
  done < "$file"
}
load_env

ARM="${1:-jev}"
DURATION="${2:-7200}"
# Lowercase: the runtime lowercases a --mind-name when it makes the home, and the
# log has to land in the same directory as the ledger.
STAMP="$(date -u +%Y%m%dt%H%M%Sz)"

SRC="architecture/lab/lemma-lab-judge.archml"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/judge-live.XXXXXX")"
ARCH="$WORKDIR/arm.archml"
DEBUG_ARG=""

case "$ARM" in
  jev|JEV)
    NAME="lemma-lab-judge-jev-${STAMP}"
    PROFILE="local-voice-jev"
    # decide.js at debug, so a 429/529 backoff shows in the log as itself rather
    # than only as one more soft failure. Only that file: the rest stays quiet.
    DEBUG_ARG="--debug=decide.js"
    cp "$SRC" "$ARCH"
    ;;
  llm|LLM)
    NAME="lemma-lab-judge-llm-${STAMP}"
    PROFILE="local-voice"
    # 8s was sized for the ~1.3 s local LLM call; the checked-in 2s is the
    # System-One deadline and would clip it.
    sed 's/compareDeadline="2s"/compareDeadline="8s"/' "$SRC" > "$ARCH"
    ;;
  *)
    echo "usage: $0 jev|llm [duration_sec]" >&2
    exit 2
    ;;
esac

HOME_DIR="memory/${NAME}"
mkdir -p "$HOME_DIR"
LOG="${HOME_DIR}/run.log"

echo "arm=$ARM name=$NAME profile=$PROFILE duration=${DURATION}s log=$LOG"
export MEDITATOR_MODEL_PROFILE="$PROFILE"

bun meditator.js -a "$ARCH" --mind-name "$NAME" ${DEBUG_ARG} >>"$LOG" 2>&1 &
PID=$!
cleanup() {
  kill -INT "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM
sleep "$DURATION"
kill -INT "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
echo "ledger: ${HOME_DIR}/predictions/ledger.jsonl"
