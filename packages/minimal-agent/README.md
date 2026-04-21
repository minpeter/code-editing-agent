## Minimal Agent

Minimal OpenAI-compatible example agent built on the workspace packages.

## Requirements

- Node.js 22+
- pnpm 10+
- `AI_API_KEY`

Optional:

- `AI_BASE_URL`
- `AI_MODEL`
- `AI_CONTEXT_LIMIT`

## Scripts

From the workspace root:

```bash
pnpm --filter @plugsuits/minimal-agent dev
pnpm --filter @plugsuits/minimal-agent build
```

## Workflows

Run from source in watch mode during development:

```bash
pnpm --filter @plugsuits/minimal-agent dev
```

Build the package output:

```bash
pnpm --filter @plugsuits/minimal-agent build
```

Run headless mode directly from source:

```bash
node --conditions=@ai-sdk-tool/source --import tsx packages/minimal-agent/index.ts --prompt "Summarize this repository"
```

## Slash commands

- `/new` (aliases: `/clear`, `/reset`) — start a new session.
- `/reasoning <on|off>` — toggle provider-level reasoning. Persisted across sessions via `@ai-sdk-tool/harness/preferences` in `~/.plugsuits/settings.json` (user layer) and `./.plugsuits/settings.json` (workspace layer). Run without arguments to see the current value.

## Persisted preferences

The agent loads preferences from two layered JSON files and applies them before the session starts:

```
~/.plugsuits/settings.json     ← user-global defaults
./.plugsuits/settings.json     ← workspace override (write target)
```

The workspace layer overrides the user layer on conflict. Writes land on the workspace layer only — global defaults stay intact. Adding a new persisted toggle is roughly ten lines of code:

```typescript
import { createLayeredPreferences } from "@ai-sdk-tool/harness/preferences";

const prefs = createLayeredPreferences<{ reasoningEnabled?: boolean }>({
  appName: "plugsuits",
});
const initial = await prefs.store.load();
let reasoningEnabled = initial?.reasoningEnabled ?? false;

// Inside a slash command:
reasoningEnabled = true;
await prefs.patch({ reasoningEnabled: true });
```

See `preferences.ts` and `index.ts` for the full example.
