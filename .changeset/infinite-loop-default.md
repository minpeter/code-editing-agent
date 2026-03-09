---
"@ai-sdk-tool/harness": patch
---

Remove hardcoded MANUAL_TOOL_LOOP_MAX_STEPS=200 cap and default maxIterations to Infinity. The loop now runs until the model returns a stop finish reason, an abort signal fires, or a custom shouldContinue callback returns false. Also fix shouldContinue context inconsistency where iteration was stale (pre-increment) while messages were already updated.
