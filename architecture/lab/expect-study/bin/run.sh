#!/usr/bin/env bash
# Run one expect-study arm for DURATION_SEC seconds (default 7200).
# Usage: run.sh P|C [duration_sec]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"

ARM="${1:-P}"
DURATION="${2:-7200}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

SRC="architecture/lab/lemma-lab-expect.archml"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/expect-study.XXXXXX")"
ARCH="$WORKDIR/arm.archml"

if [[ "$ARM" == "P" || "$ARM" == "p" ]]; then
  NAME="lemma-lab-expect-p-${STAMP}"
  cp "$SRC" "$ARCH"
elif [[ "$ARM" == "C" || "$ARM" == "c" ]]; then
  NAME="lemma-lab-expect-c-${STAMP}"
  # Control arm: prediction off. Comparator and ledger stay so the wiring is
  # identical; without prediction="on" no expect field is offered.
  sed 's/prediction="on"/prediction="off"/' "$SRC" > "$ARCH"
else
  echo "usage: $0 P|C [duration_sec]" >&2
  exit 2
fi

echo "arm=$ARM name=$NAME duration=${DURATION}s arch=$ARCH"
export MEDITATOR_MODEL_PROFILE="${MEDITATOR_MODEL_PROFILE:-local-voice}"

# --mind-name keeps lemma-lab-expect's checked-in home untouched.
bun meditator.js -a "$ARCH" --mind-name "$NAME" &
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
echo "ledger: memory/${NAME}/predictions/ledger.jsonl"
