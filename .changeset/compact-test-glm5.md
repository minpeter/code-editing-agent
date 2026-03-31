---
"plugsuits": patch
"@ai-sdk-tool/harness": patch
---

Switch compact-test model backend from MiniMax-M2.5 to GLM-5

Fix model-agnostic compaction bug: prevent totalTokens from being misattributed as promptTokens when the provider omits prompt token counts. Invalidate stale actualUsage after message changes and compaction to ensure consistent compaction decisions across all models.
