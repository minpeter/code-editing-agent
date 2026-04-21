---
"@ai-sdk-tool/tui": patch
---

Render an inline "Preparing tool call…" spinner inside `BaseToolCallView` from the moment the view is created until the tool name + input arrive. Previously a tool view that was appended on `tool-input-start` with no tool name or input rendered as zero lines, then grew to the pretty-block height once `tool-input-delta` populated it — the editor briefly jumped up into the empty-view gap and came back down. The pending indicator reserves a one-line slot immediately, so the spinner → tool-block transition is a same-height swap with no shift.
