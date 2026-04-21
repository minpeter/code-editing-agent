---
"@ai-sdk-tool/tui": patch
"plugsuits": patch
"@plugsuits/minimal-agent": patch
---

Mount the foreground loader spinner inline as the last child of `chatContainer` so spinner mount/unmount cycles no longer shrink the status slot and cause the editor to jump upward mid-stream. The separate `statusContainer` between chat and editor is renamed to `overlayContainer` and kept for slash-command selector overlays (`/reasoning-mode`, `/translate`, tool fallback selector, `/reasoning`), which continue to work unchanged — the rename is the only API surface change. `IdleStatusPlaceholder`, `idleStatusPlaceholderMode`, and all the per-stream-part suppression hooks that tried to guess when to hide the placeholder are removed because the inline spinner makes them unnecessary: natural downward growth of chat is visually stable, upward contractions that used to happen when the placeholder toggled are gone.

**Breaking change**: `CommandPreprocessHooks.statusContainer` is renamed to `CommandPreprocessHooks.overlayContainer`. External consumers that mount selector overlays via `hooks.statusContainer.addChild(...)` must update to `hooks.overlayContainer.addChild(...)`. The in-repo consumers (CEA, minimal-agent) are migrated in this same changeset.
