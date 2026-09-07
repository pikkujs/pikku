---
'@pikku/skills': patch
---

pikku-wiring: document how an MCP tool is actually reached

`references/mcp.md` ended with a standalone `PikkuMCPServer` bootstrap — a
`start.ts` that builds services, loads `mcp.gen.json` and calls `connectStdio()`.
Nothing in a `pikku dev` / `pikku serve` / deployed app does that: the runtime
mounts the MCP server itself at `/mcp` (`mcpPath` to move it) whenever
`mcp.gen.json` has at least one entry. An agent following the old section wrote a
server process nobody runs, and then could not tell the person who asked for the
tool where to point their assistant.

Replaces it with the reachable URL, the two things that read as breakage — the
mount is skipped while there is nothing to serve, and correct MCP wiring has no
`wires/mcp` directory and no `mcp` config block — and the instruction to hand over
the URL. Swaps the stdio-logger red flag for a `/mcp` 404 one.
