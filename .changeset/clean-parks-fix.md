---
"@plugsuits/cea": patch
---

Fix PID recycling vulnerability in killProcessTree()

The `killProcessTree()` function previously used negative PID process group kill without verification, which could kill unrelated processes after PID recycling. This fix adds:

- Session ID tracking for all spawned processes
- Identity verification before killing any process
- Protection against killing processes with mismatched session IDs
- Comprehensive tests for PID recycling safety scenarios

Resolves #51
