---
"@ai-sdk-tool/tui": patch
"plugsuits": patch
"@plugsuits/minimal-agent": patch
---

Replace the repeated empty-input system message in the agent TUI with a transient, spinner-free footer warning.

- Submitting an empty prompt no longer appends a new system message to the chat log every time; instead, the footer briefly shows a warning-styled "Type a message to send" hint that clears itself after ~900ms.
- `FooterStatusBar.setForegroundMessage` now accepts a severity level (`info` / `warning` / `error`) and an explicit `ready` / `running` state so transient warnings render in the warning color without a spinner, while actual loaders keep their spinning indicator.
- `summarizeFooterStatuses` takes a structured `foregroundStatus` (message + state) rather than a bare message string so foreground states are preserved through the footer render pipeline.
- The empty-input nudge timer is cleared during TUI shutdown to avoid dangling timeouts.
