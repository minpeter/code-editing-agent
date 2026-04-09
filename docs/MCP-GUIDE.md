# MCP Integration Guide

## Overview
Plugsuits provides two primary ways to integrate Model Context Protocol (MCP) tools into your agents.

## Option 1: Config-based MCP (Built-in)
The `MCPLoader` namespace provides factory methods to load MCP servers from configuration files or inline definitions. This is the simplest way to use standard MCP servers.

```typescript
import { createAgent, MCPLoader } from '@plugsuits/harness';

const agent = await createAgent({
  model: myModel,
  // Load from default .mcp.json or specific path
  mcp: MCPLoader.fromFile(), 
  // OR define servers inline
  // mcp: MCPLoader.fromServers([{ command: 'node', args: ['server.js'] }]),
});
```

### When to use
- You have standard MCP servers (stdio or HTTP/SSE).
- You want to use a shared `.mcp.json` configuration file.
- No custom authentication or complex proxying is required.

## Option 2: Custom Bridge via ToolSource
For advanced scenarios, you can implement the `ToolSource` interface. This allows you to pull tools from any source, including authenticated gateways or custom tool providers.

```typescript
import { createAgent, ToolSource, ToolDefinition } from '@plugsuits/harness';

class MyCustomBridge implements ToolSource {
  async listTools(): Promise<ToolDefinition[]> {
    // Fetch tool definitions from your custom provider
    return [{ name: 'my_tool', description: '...', parameters: {} }];
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    // Forward the tool call to your backend/gateway
    return { result: 'success' };
  }
}

const agent = await createAgent({
  model: myModel,
  toolSources: [new MyCustomBridge()],
});
```

### When to use
- You are integrating with a custom tool provider or a centralized hub (like omo-hub).
- You need to handle complex authentication (e.g., forwarding user tokens).
- You want to dynamically filter or transform tools before they reach the agent.

## MCPLoader Factory Methods

| Method | Description |
| --- | --- |
| `fromFile(path?)` | Loads servers from a JSON config file (defaults to `.mcp.json`). |
| `fromServers(configs)` | Loads servers from an array of `MCPServerConfig` objects. |
| `merged({ file, servers })` | Combines file-based and inline server configurations. |
| `preinitialized(manager)` | Uses an existing `MCPManager` instance. |

## Decision: Config MCP vs ToolSource

| Use Case | Recommended Approach |
| --- | --- |
| Standard local/remote MCP servers | **Config-based MCP** |
| Shared `.mcp.json` across projects | **Config-based MCP** |
| Authenticated tool gateways | **ToolSource** |
| Dynamic tool discovery from APIs | **ToolSource** |
| Custom tool execution logic | **ToolSource** |
