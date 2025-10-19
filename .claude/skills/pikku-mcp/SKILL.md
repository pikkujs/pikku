---
name: pikku-mcp
description: Guide for wiring Pikku functions to MCP (Model Context Protocol) resources, tools, and prompts. Use when creating MCP integrations, exposing code search, building AI agent tools, or implementing prompt templates.
---

# Pikku MCP Wiring Skill

This skill helps you wire Pikku functions to MCP (Model Context Protocol) resources, tools, and prompts using the generated adapter APIs.

## When to use this skill

- Creating MCP resources (data sources for AI models)
- Building MCP tools (actions AI models can invoke)
- Implementing MCP prompts (reusable prompt templates)
- Exposing code search or documentation to AI models
- Building AI agent integrations

## Core Principles

MCP wiring is a **thin binding layer** that:
- Registers exported MCP functions to the MCP runtime
- Leaves all logic inside `packages/functions/src/functions/**/*.function.ts`
- Never touches services directly from wiring

## File Naming Rules

- MCP wiring files must end with `.mcp.ts`
- Files can live anywhere under `packages/functions/src/`
- You may group multiple MCP bindings (resources/tools/prompts) in a single file (same transport only)

## Allowed Imports

✅ `wireMCPResource`, `wireMCPTool`, `wireMCPPrompt` from `./pikku-types.gen.js`, exported MCP functions, optional middleware/permissions

❌ Never import from `./services/**`, implement business logic in wiring, or access env/globals directly

## MCP Function Types

**IMPORTANT: Always specify the output type explicitly.**

**Resources:** Data sources for AI models
```typescript
pikkuMCPResourceFunc<In, MCPResourceResponse>(...)
```

**Tools:** Actions AI models can invoke
```typescript
pikkuMCPToolFunc<In, MCPToolResponse>(...)
```

**Prompts:** Reusable prompt templates
```typescript
pikkuMCPPromptFunc<In, MCPPromptResponse>(...)
```

### Response Types

```typescript
type MCPResourceResponse = Array<{ uri: string; text: string }>
type MCPToolResponse = Array<
  | { type: 'text'; text: string }
  | { type: 'image'; data: string }
>
type MCPPromptResponse = Array<{
  role: 'user' | 'assistant' | 'system'
  content: { type: 'text' | 'image'; text: string; data?: string }
}>
```

## Basic Wiring

**Resource:**
```typescript
import { wireMCPResource } from './pikku-types.gen.js'
import { codeSearch } from './functions/code-search.function.js'

wireMCPResource({
  name: 'codeSearch',
  description: 'Search codebase',
  func: codeSearch,
})
```

**Tool:**
```typescript
import { wireMCPTool } from './pikku-types.gen.js'
import { annotateFile } from './functions/code-ops.function.js'

wireMCPTool({
  name: 'annotateFile',
  description: 'Add annotation to code',
  func: annotateFile,
})
```

**Prompt:**
```typescript
import { wireMCPPrompt } from './pikku-types.gen.js'
import { reviewPrompt } from './functions/review-prompt.function.js'

wireMCPPrompt({
  name: 'reviewCode',
  description: 'Generate code review prompt',
  func: reviewPrompt,
})
```

## Optional Properties

All MCP wiring functions support optional properties:

```typescript
wireMCPTool({
  name: 'annotateFile',
  description: 'Add annotation to code',
  func: annotateFile,
  tags: ['code-ops', 'ai'],
  middleware: [auditMiddleware],
  permissions: { admin: requireAdmin },
})
```

See examples for complete function definitions.

## Grouping MCP Bindings

You may group multiple MCP bindings in one `.mcp.ts` file. See `examples/grouped.mcp.ts`.

## Error Handling

- MCP functions should throw `PikkuError` subclasses
- Register errors with **HTTP status** and **MCP error codes** using `addError`
- Always provide `mcpCode` for MCP-reachable errors

```typescript
addError(NotFoundError, {
  status: 404,
  mcpCode: -32601, // MCP "method not found"
  message: 'The server cannot find the requested resource.',
})
```

## Examples

See `examples/` directory:
- `code-search.function.ts` - MCP resource function
- `code-ops.function.ts` - MCP tool function
- `review-prompt.function.ts` - MCP prompt function
- `resource.mcp.ts` - Resource wiring
- `tool.mcp.ts` - Tool wiring
- `prompt.mcp.ts` - Prompt wiring
- `grouped.mcp.ts` - Multiple bindings

## Review Checklist

- [ ] File ends with `.mcp.ts`
- [ ] Adapter imports only from `./pikku-types.gen.ts`
- [ ] **CRITICAL: MCP wiring uses object form with `func`, `name`, `description`**
- [ ] **CRITICAL: MCP functions specify output type (MCPResourceResponse | MCPToolResponse | MCPPromptResponse)**
- [ ] Functions are `async` and destructure services
- [ ] Keep functions thin; prefer `rpc.invoke` for reuse
- [ ] Errors registered with `addError` including `status` and `mcpCode`
- [ ] Functions defined in `./functions/**/*.function.ts`, not in wiring files
