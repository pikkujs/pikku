# @pikku/mcp-server

A Pikku MCP server runtime that uses the official MCP SDK to expose Pikku endpoints as MCP tools.

## Features

- Uses the official `@modelcontextprotocol/sdk` for MCP compliance
- Automatically loads Pikku MCP endpoints from generated bootstrap files
- Configurable server name, version, and capabilities
- Supports both tools and resources
- JSON-RPC 2.0 compliant via Pikku's core MCP system
- Stdio transport for seamless integration with MCP clients

## Usage

### 1. Generate MCP Files

First, generate the MCP JSON and bootstrap files using the Pikku CLI:

```bash
npx pikku mcp
```

This creates:

- `mcp.json` - MCP tool definitions with schemas
- `mcp-bootstrap.ts` - Bootstrap file that registers all endpoints

### 2. Import MCP Bootstrap and Create Server

```typescript
import { PikkuMCPServer } from '@pikku/mcp-server'
import { createSingletonServices } from './services'

// Import your generated MCP bootstrap to register endpoints
import './mcp-bootstrap.js'

const config = {
  name: 'my-pikku-server',
  version: '1.0.0',
  mcpJsonPath: './mcp.json',
  capabilities: { tools: {} },
  // ... other CoreConfig options
}

const singletonServices = await createSingletonServices(config)
const server = new PikkuMCPServer(
  config,
  singletonServices,
  createSessionServices // optional
)

await server.init()
await server.start()
```

### 3. Integration with MCP Clients

The server uses stdio transport and can be integrated with any MCP client:

```json
{
  "mcpServers": {
    "pikku-server": {
      "command": "node",
      "args": ["./dist/server.js"]
    }
  }
}
```

## Configuration

The `MCPServerConfig` interface extends Pikku's `CoreConfig` with:

- `name`: Server name for MCP identification
- `version`: Server version
- `mcpJsonPath`: Path to generated MCP JSON schema file
- `capabilities`: Optional MCP capabilities configuration

## How It Works

1. **Bootstrap Import**: User imports MCP bootstrap file to register Pikku endpoints
2. **Initialization**: Server loads MCP JSON schema and discovers registered endpoints
3. **Tool Discovery**: `ListToolsRequestSchema` handler returns available tools from JSON
4. **Tool Execution**: `CallToolRequestSchema` handler routes requests to Pikku's MCP system
5. **Response Formatting**: Converts Pikku responses to MCP format

## Example MCP Tool Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"userId\": \"123\", \"name\": \"John Doe\"}"
    }
  ]
}
```
