---
"@ai-sdk-tool/tui": patch
---

Keep the status slot at a constant 2-line height throughout an active assistant turn — placeholder when idle, spinner when a loader is mounted — so tool-call and text-start transitions no longer cause the slot to collapse and re-expand mid-stream. The slot now collapses to 0 lines only once, when the final turn completes (`finalizeSuccessfulStreamTurn` → `"completed"`) or the user interrupts, eliminating every other shift during streaming.

This supersedes the earlier attempts to predict the final response (on `text-start`) and to preempt the Executing spinner slot (on `tool-input-start`): those were provider-specific hacks and couldn't cover providers that skip `tool-input-start` or chunk tool input differently.
