---
"@ai-sdk-tool/tui": patch
"plugsuits": patch
---

Surface reasoning/thinking on the foreground spinner and unify the tool-pending "Executing..." indicator with the TUI status spinner's visual style.

- TUI: while the model streams reasoning parts, the foreground spinner now stays visible with the label swapped to `Thinking...`. Previously the spinner was cleared as soon as the first `reasoning-start` part arrived (because reasoning parts counted as "first visible" in `isVisibleStreamPart`), leaving the user staring at dim italic reasoning text with no indication that the agent was still working. Reasoning parts are now treated as non-visible for the purpose of the first-visible-part trigger, so the spinner is only cleared when real text/tool output arrives.
- TUI: `PiTuiStreamState` gains optional `onReasoningStart` / `onReasoningEnd` callbacks. `handleReasoningStart` invokes `onReasoningStart`; a new `handleReasoningEnd` handler invokes `onReasoningEnd` (previously `reasoning-end` was silently dropped via `IGNORE_PART_TYPES`). `renderAgentStream` wires these into `foregroundStatus.setMessage()` so the spinner label temporarily becomes `Thinking...` during reasoning spans and restores the caller-provided base label (`Working...`) when reasoning ends.
- TUI: `BaseToolCallView`'s pending "Executing.." indicator now uses the same braille frame set (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) and the same cyan-frame / dim-message ANSI styling as the foreground `StatusSpinner`, and the label is normalized to `Executing...` (three dots, matching `Processing...` / `Working...` / `Thinking...`). Previously tool-pending blocks used plain ASCII `- \ | /` frames with no color.
- CEA: the internal `pi-tui-stream-renderer.ts` pending spinner is kept in sync (same braille frames, same cyan/dim styling, same `Executing...` label) even though the production entrypoint routes through `createAgentTUI` + `BaseToolCallView`. Tests updated accordingly (`EXECUTING_SPINNER_TEXT_REGEX` now matches the braille frames; string assertions updated to `Executing...`).
