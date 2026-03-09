---
"@ai-sdk-tool/harness": minor
---

Improve compaction reliability, token estimation, and tool-pair handling

- Remove fire-and-forget compaction race condition — use explicit `compact()` or `getMessagesForLLMAsync()`
- Add CJK token estimation (Korean/Chinese/Japanese: ~1.5 chars/token vs Latin ~4 chars/token)
- Fix splitIndex edge cases for single-message and boundary scenarios
- Preserve tool-call/tool-result pairs during compaction
- Improve default summarizer with conversation turn grouping
- Add `needsCompaction()` for synchronous threshold checking
- Add `getMessagesForLLMAsync()` for async compaction + message retrieval
- Add E2E test suite for real model compaction validation
