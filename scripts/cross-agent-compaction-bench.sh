#!/bin/bash
set -euo pipefail

EXAMPLES_DIR="/Users/minpeter/github.com/temp/harness-examples"
RESULTS_DIR="/Users/minpeter/github.com/minpeter/plugsuits/results/cross-agent"
PROMPT="코드베이스를 탐색하고, 이 코드 베이스에 대해서 설명해줘"
TIMEOUT=300
LIMITS="${1:-32000,40000}"
FRIENDLI_MODEL="${2:-MiniMaxAI/MiniMax-M2.5}"
FRIENDLI_BASE="https://api.friendli.ai/serverless"

TIMEOUT_CMD="gtimeout"
if ! command -v gtimeout &>/dev/null; then
  if command -v timeout &>/dev/null; then TIMEOUT_CMD="timeout"
  else echo "ERROR: gtimeout or timeout required (brew install coreutils)"; exit 1; fi
fi

mkdir -p "$RESULTS_DIR"

run_plugsuits() {
  local limit=$1
  local tag="plugsuits-${limit}"
  echo "▶ [plugsuits] limit=${limit} model=${FRIENDLI_MODEL} (friendli native)"
  COMPACTION_DEBUG=1 CONTEXT_LIMIT_OVERRIDE=$limit \
    $TIMEOUT_CMD $TIMEOUT node --conditions=@ai-sdk-tool/source --import tsx \
    /Users/minpeter/github.com/minpeter/plugsuits/packages/cea/src/entrypoints/main.ts \
    -p "$PROMPT" --no-translate --max-iterations 12 \
    -m "$FRIENDLI_MODEL" --provider friendli \
    > "$RESULTS_DIR/${tag}-trajectory.jsonl" \
    2> "$RESULTS_DIR/${tag}-stderr.log" || true
  echo "  ✓ plugsuits@${limit} done"
}

run_pi_mono() {
  local limit=$1
  local tag="pi-mono-${limit}"
  echo "▶ [pi-mono] limit=${limit} model=${FRIENDLI_MODEL} (friendli via openai provider)"
  cd "$EXAMPLES_DIR/pi-mono"
  CONTEXT_LIMIT_OVERRIDE=$limit \
  OPENAI_API_KEY="${FRIENDLI_TOKEN}" \
    $TIMEOUT_CMD $TIMEOUT node packages/coding-agent/dist/cli.js \
    -p "$PROMPT" --no-session \
    --provider openai --model "${FRIENDLI_MODEL}" \
    > "$RESULTS_DIR/${tag}-output.txt" \
    2> "$RESULTS_DIR/${tag}-stderr.log" || true
  cd - > /dev/null
  echo "  ✓ pi-mono@${limit} done"
}

run_gemini_cli() {
  local limit=$1
  local tag="gemini-cli-${limit}"
  if [ -z "${GOOGLE_API_KEY:-}" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
    echo "⏭ [gemini-cli] SKIPPED (no GOOGLE_API_KEY)"
    echo "SKIPPED: no API key" > "$RESULTS_DIR/${tag}-output.txt"
    return
  fi
  echo "▶ [gemini-cli] limit=${limit} model=gemini (google)"
  cd "$EXAMPLES_DIR/gemini-cli"
  CONTEXT_LIMIT_OVERRIDE=$limit \
    $TIMEOUT_CMD $TIMEOUT node packages/cli/dist/index.js \
    -p "$PROMPT" \
    > "$RESULTS_DIR/${tag}-output.txt" \
    2> "$RESULTS_DIR/${tag}-stderr.log" || true
  cd - > /dev/null
  echo "  ✓ gemini-cli@${limit} done"
}

run_crush() {
  local limit=$1
  local tag="crush-${limit}"
  echo "▶ [crush] limit=${limit} model=${FRIENDLI_MODEL} (friendli via .crush.json)"
  cd "$EXAMPLES_DIR/crush"
  CONTEXT_LIMIT_OVERRIDE=$limit \
    $TIMEOUT_CMD $TIMEOUT ./crush-bin run "$PROMPT" \
    > "$RESULTS_DIR/${tag}-output.txt" \
    2> "$RESULTS_DIR/${tag}-stderr.log" || true
  cd - > /dev/null
  echo "  ✓ crush@${limit} done"
}

cat << HEADER
═══════════════════════════════════════════════════════
  Cross-Agent Compaction Benchmark
  Limits: $LIMITS
  Model: $FRIENDLI_MODEL (Friendli Serverless)
  Timeout: ${TIMEOUT}s per run
  Results: $RESULTS_DIR
  
  Agents:
    plugsuits  → friendli provider (native)
    pi-mono    → ANTHROPIC_BASE_URL → friendli
    gemini-cli → Google Gemini API (if key set)
    crush      → ANTHROPIC_BASE_URL → friendli
═══════════════════════════════════════════════════════

HEADER

START=$(date +%s)

IFS=',' read -ra LIMIT_ARRAY <<< "$LIMITS"
for limit in "${LIMIT_ARRAY[@]}"; do
  echo "━━━ Context Limit: ${limit} ━━━"
  
  run_plugsuits "$limit" &
  PID_PS=$!
  
  run_pi_mono "$limit" &
  PID_PI=$!
  
  run_gemini_cli "$limit" &
  PID_GEM=$!
  
  run_crush "$limit" &
  PID_CR=$!
  
  wait $PID_PS $PID_PI $PID_GEM $PID_CR 2>/dev/null || true
  echo
done

END=$(date +%s)
ELAPSED=$((END - START))

echo
echo "═══════════════════════════════════════════════════════"
echo "  Results Summary — Total time: ${ELAPSED}s"
echo "═══════════════════════════════════════════════════════"
echo
printf "  %-28s %6s  %8s  %s\n" "Agent@Limit" "Lines" "Bytes" "Status"
printf "  %-28s %6s  %8s  %s\n" "────────────" "─────" "─────" "──────"
for f in "$RESULTS_DIR"/*-output.txt "$RESULTS_DIR"/*-trajectory.jsonl; do
  [ -f "$f" ] || continue
  name=$(basename "$f" | sed 's/-output.txt//' | sed 's/-trajectory.jsonl//')
  lines=$(wc -l < "$f" 2>/dev/null | tr -d ' ')
  size=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
  if grep -q "SKIPPED" "$f" 2>/dev/null; then
    status="SKIPPED"
  elif [ "$size" -lt 50 ]; then
    status="EMPTY"
  elif grep -q '"type":"error"' "$f" 2>/dev/null; then
    status="ERROR"
  else
    status="OK"
  fi
  printf "  %-28s %6s  %8s  %s\n" "$name" "$lines" "$size" "$status"
done
