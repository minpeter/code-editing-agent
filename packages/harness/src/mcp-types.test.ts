import { describe, expect, it, vi } from "vitest";

import { MCPManager } from "./mcp-manager";
import { MCPLoader } from "./mcp-types";

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: vi.fn(),
}));

vi.mock("@ai-sdk/mcp/mcp-stdio", () => ({
  Experimental_StdioMCPTransport: vi.fn(),
}));

vi.mock("./mcp-config.js", () => ({
  loadMCPConfig: vi.fn().mockResolvedValue({ mcpServers: {} }),
  isStdioConfig: vi.fn(),
}));

vi.mock("./mcp-tool-merger.js", () => ({
  mergeMCPTools: vi.fn().mockReturnValue({ tools: {}, conflicts: [] }),
}));

describe("MCPLoader", () => {
  it("fromFile() returns file loader shape", () => {
    expect(MCPLoader.fromFile()).toEqual({ type: "file", path: undefined });
  });

  it("fromServers() returns inline loader shape", () => {
    expect(MCPLoader.fromServers([])).toEqual({ type: "inline", servers: [] });
  });

  it("preinitialized() returns the same manager instance", () => {
    const manager = new MCPManager();

    expect(MCPLoader.preinitialized(manager)).toBe(manager);
  });
});
