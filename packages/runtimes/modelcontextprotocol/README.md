# @pikku/modelcontextprotocol

MCP server runtime for Pikku, built on the official `@modelcontextprotocol/sdk`.
Exposes your Pikku wirings as MCP tools and resources over stdio.

## Install

```bash
npm install @pikku/modelcontextprotocol
```

## Usage

Generate the MCP schema and bootstrap first:

```bash
npx pikku mcp
```

Then start the server:

```typescript
import { PikkuMCPServer } from '@pikku/modelcontextprotocol'

import './.pikku/mcp-bootstrap.gen.js'

const server = new PikkuMCPServer(
  {
    name: 'my-pikku-server',
    version: '1.0.0',
    mcpJsonPath: './mcp.json',
    capabilities: { tools: {} },
  },
  singletonServices,
  createWireServices
)

await server.init()
await server.start()
```

Point an MCP client at the built entry file:

```json
{
  "mcpServers": {
    "pikku-server": { "command": "node", "args": ["./dist/server.js"] }
  }
}
```

## Docs

https://pikku.dev/docs
