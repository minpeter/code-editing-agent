---
"@ai-sdk-tool/tui": patch
---

Merge the foreground loader spinner into the existing footer status bar so the spinner (`⠦ Thinking…`, `⠼ Executing…`) and the context-pressure indicator (`8.5k/64.0k (13.2%)`) share a single row. The spinner is no longer a standalone container child, so mounting and unmounting it no longer changes the footer's total line count — this fully removes the last residual upward-jump when a tool call starts. `FooterStatusBar` now exposes `setForegroundMessage`, which `showLoader`/`clearStatus`/the spinner orchestrator's `setMessage` route through. The obsolete `StatusSpinner` class, `createStatusSpinner`, and the dedicated `statusContainer` slot are removed.
