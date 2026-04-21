---
"@ai-sdk-tool/tui": patch
---

Mount the idle status placeholder the moment a `tool-input-start` stream part arrives, so the 2-line slot is already in place before the orchestrator swaps in the `Executing…` spinner on the following `tool-call` part. Previously the slot was 0 lines while the tool input was streaming (e.g. `shell "sleep 3"`) and jumped to 2 lines when the spinner appeared, producing a visible shift.
