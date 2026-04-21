---
"@ai-sdk-tool/harness": patch
"plugsuits": patch
---

Persist user-level agent preferences (`/translate`, `/reasoning-mode`, `/tool-fallback`) across sessions so toggles set in the TUI survive process restarts.

- Harness: new generic `PreferencesStore<T>` abstraction with `FilePreferencesStore` (single atomic JSON document), `InMemoryPreferencesStore`, `LayeredPreferencesStore` (user-global + workspace overlay with configurable merge + write layer), and `shallowMergePreferences` helper. Exposed from the package root and a new `@ai-sdk-tool/harness/preferences` subpath. Intentionally separate from `SnapshotStore` because preferences are app/user-scoped while snapshots are session-scoped.
- CEA: new `createUserPreferencesStore()` that layers `~/.plugsuits/settings.json` (user defaults) under `.plugsuits/settings.json` (workspace override). Stored payload is Zod-validated against the `translateEnabled` / `reasoningMode` / `toolFallbackMode` schema and the workspace layer is the only write target, so global defaults stay untouched when users toggle state from the TUI.
- CEA: `/translate`, `/reasoning-mode`, `/tool-fallback` commands now persist the new value to the workspace layer via a shared `preferences-persistence` module. Persistence is opt-in per process (`configurePreferencesPersistence`) so tests that exercise commands directly remain side-effect free.
- CEA startup: persisted preferences are applied to `AgentManager` before CLI flags. Explicit CLI flags (`--no-translate`, `--reasoning-mode on`, `--tool-fallback`, `--toolcall-mode`) still win for the current process but no longer overwrite the persisted file — they are one-shot overrides only, as requested. `resolveSharedConfig` now accepts `rawArgs` so callers can distinguish explicit flags from defaults.
