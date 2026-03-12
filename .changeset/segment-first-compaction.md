---
"@ai-sdk-tool/harness": minor
"@ai-sdk-tool/tui": minor
"@ai-sdk-tool/headless": minor
"plugsuits": minor
---

refactor: ship the segment-first compaction system across the shared runtimes

- move harness compaction onto segment-based state and prepared artifacts
- share compaction orchestration across TUI and headless runtimes
- guard CEA model calls from empty prepared message lists under tight context budgets
