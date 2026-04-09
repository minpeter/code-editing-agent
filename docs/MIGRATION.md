# Migration Guide

## Breaking Changes

### maxStepsPerTurn default behavior change
The default behavior of `maxStepsPerTurn` has changed to better support multi-step tool execution.

**Before**: The default was effectively 1 step per turn, meaning the agent would stop after one LLM call, regardless of whether it produced tool calls or text.
**After**: The default behavior now continues to run until the LLM produces a text response. This allows agents to chain multiple tool calls in a single turn.

**To keep the old behavior**:
```typescript
createAgent({
  model: myModel,
  maxStepsPerTurn: 1, // Explicitly limit to 1 step
});
```

**New guardrails** (active when `maxStepsPerTurn` is not set):
- `maxToolCallsPerTurn`: 50 (default) - Prevents infinite tool call loops.
- `repeatedToolCallThreshold`: 3 (default) - Stops if the same tool with the same arguments is called multiple times consecutively.

### PreprocessResult type change (tui consumers)
If you are implementing custom preprocessing logic (common in TUI or platform-specific adapters), the result type has been updated to be more explicit.

**Before**:
```typescript
return { contentForModel: text, translatedDisplay: text };
```

**After**:
```typescript
return { success: true, message: text, translatedDisplay: text };
// Or for errors:
// return { success: false, error: '...' };
```

## New Features (Non-Breaking)

### MCPLoader namespace
A new `MCPLoader` namespace provides standardized factory methods for loading MCP configurations, replacing manual `MCPManager` setup in most cases.

```typescript
const agent = await createAgent({
  model: myModel,
  mcp: MCPLoader.fromFile(),
});
```

### AgentGuardrails
Fine-tune agent behavior and safety limits using the `guardrails` configuration.

```typescript
createAgent({
  guardrails: {
    maxToolCallsPerTurn: 10,
    repeatedToolCallThreshold: 2,
  },
});
```

### Preset factories (createMemoryAgent, createSessionAgent)
Presets simplify common agent patterns. `createMemoryAgent` is ideal for transient conversations, while `createSessionAgent` integrates with `SessionStore` for persistence.

### ToolSource contract
The `ToolSource` interface allows you to define custom tool providers that can be passed to agents via the `toolSources` array.
