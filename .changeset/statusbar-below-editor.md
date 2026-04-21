---
"@ai-sdk-tool/tui": patch
---

Move the foreground loader spinner out of `chatContainer` and into a dedicated `statusContainer` that sits **below** the editor, between `editorContainer` and `footerContainer`. This fully eliminates the residual upward-jump the user saw whenever a tool call started: previously the spinner lived inline in chat, so detaching it shrank chat by 2 lines and pulled the editor up; now the spinner lives in a slot that only impacts the footer row when it toggles, which is out of the user's visual focus and does not move chat or the editor at all.
