---
type: decision
title: MCP resources, tools and prompts take sessionless functions, because an MCP client is not a logged-in user
description: The MCP wiring types default each func to CorePikkuFunctionSessionless, so an MCP entry point is declared without a session type; whether a session is required is decided per function by the runner
tags: core, mcp, auth, sessionless
---

# MCP resources, tools and prompts take sessionless functions, because an MCP client is not a logged-in user

`packages/core/src/wirings/mcp/mcp.types.ts` types the three MCP wirings the same way. Each one's `func` defaults to `CorePikkuFunctionSessionless`:

- `CoreMCPResource`: default at line 92, and the `func` field is commented "It is sessionless: an MCP client is not a logged-in user" at line 113.
- `CoreMCPTool`: default at line 123, and the same comment at line 138.
- `CoreMCPPrompt`: default at line 150, and the same comment at line 163.

So an MCP entry point is declared without a session-carrying function type. The types do not say whether a particular MCP call needs a session. The per-function declaration does that: `mcpTargetRequiresSession`, described in [An MCP refusal is decided before dispatch, not raised from the tool](an-mcp-refusal-is-decided-before-dispatch.md), reads a `pikkuFunc` as always needing a session, and a sessionless function as needing one only where it sets `auth: true`.

**What this rules out:** typing an MCP wiring's `func` as a session-carrying function, which would make the MCP surface look as if it always has a logged-in user behind it.
