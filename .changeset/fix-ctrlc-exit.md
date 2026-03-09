---
"plugsuits": patch
---

Fix Ctrl+C double-press exit not working after a conversation due to lingering AI SDK HTTP connections keeping the event loop alive. Simplify Ctrl+C handling to match pi-coding-agent: first press clears editor, second press within 500ms exits. Remove pendingExitConfirmation state machine and force process.exit after cleanup.
