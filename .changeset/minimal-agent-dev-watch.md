---
"@ai-sdk-tool/harness": patch
---

Keep the runtime subpath importable in edge runtimes by removing unconditional Node-only dotenv, skills, MCP, and crypto imports from the core runtime graph.
