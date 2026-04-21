---
"@ai-sdk-tool/tui": patch
---

Reserve a fixed two-line slot above the prompt editor so the foreground spinner no longer causes layout shift when it mounts or unmounts, and drop the redundant header bottom spacer that duplicated that gap.
