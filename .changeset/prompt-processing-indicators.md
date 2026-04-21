---
"@ai-sdk-tool/harness": patch
"@ai-sdk-tool/tui": patch
"@ai-sdk-tool/headless": patch
---

Surface the "prompt processing" state that previously looked frozen, and fix follow-up correctness gaps found during post-implementation review.

- Harness: new `LoopHooks.onStreamStart` / `onFirstStreamPart` hooks wrap the `agent.stream()` call site so consumers driving turns through `runAgentLoop` can react to the prompt-processing latency gap. Docstring clarifies that the TUI has its own independent `onStreamStart` on `AgentTUIConfig`.
- TUI: shows a `Processing...` loader during turn preparation and transitions to `Working...` once the LLM request is in flight. The startup token probe is now non-blocking (fire-and-forget) so the editor accepts input immediately; the context-usage footer starts from the estimated count and quietly upgrades to the real value. During a blocking compaction the foreground loader temporarily switches to `Compacting...` and restores the previous label when the block ends, so users see the actual reason for a long wait. `text-start` stream parts are now treated as visible, clearing the streaming loader as soon as the assistant view mounts (no more empty-view flicker).
- Headless: emits a `turn-start` lifecycle annotation and a matching `onStreamStart` callback before each LLM request; the event is dropped from `trajectory.json` (transient UX signal, no `step_id`) so the ATIF-v1.6 schema remains unchanged and persisted consumers see identical output. The event fires exactly once per logical turn — overflow and no-output retries no longer re-emit it. New tests cover normal ordering, `new-turn` vs `intermediate-step` phases, retry single-emission, and non-persistence in `trajectory.json`.
