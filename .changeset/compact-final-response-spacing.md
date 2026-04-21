---
"@ai-sdk-tool/tui": patch
---

After a successful assistant turn completes, hide the idle status placeholder so the final response sits directly above the editor with no blank line in between. The two-line placeholder is restored on the next user submission, keeping the streaming spinner's layout stable.
