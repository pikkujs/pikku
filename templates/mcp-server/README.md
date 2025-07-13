# Pikku MCP Template

This template demonstrates how to create a Model Context Protocol (MCP) server using Pikku. It provides a complete example of building MCP-compliant tools and resources with automatic type generation and JSON-RPC 2.0 support.

## What's Included

### MCP Functions (`src/mcp.functions.ts`)

- **sayHello**: A simple greeting tool that accepts an optional name parameter
- **calculate**: A calculator tool that performs basic math operations (add, subtract, multiply, divide)
- **getUserInfo**: A mock user information resource that returns user profile data

### MCP Routes (`src/mcp.routes.ts`)

Registers the functions as MCP endpoints using the unified `addMCPEndpoint()` function with explicit type specification:

- Tools: `sayHello`, `calculate` (type: 'tool')
- Resources: `getUserInfo` (type: 'resource')

### Generated Files (`.pikku/mcp/`)

- `mcp.gen.json`: MCP tool definitions with JSON schemas
- `pikku-mcp-bootstrap.gen.ts`: Bootstrap file that registers all MCP endpoints

## Quick Start

1. **Install dependencies:**

   ```bash
   yarn install
   ```

2. **Generate Pikku files:**

   ```bash
   yarn prebuild
   ```

3. **Build the TypeScript:**

   ```bash
   yarn build
   ```

4. **Start the MCP server:**
   ```bash
   yarn start
   ```

## Development

For development with auto-reload:

```bash
yarn dev
```

## Using with MCP Clients

The server uses stdio transport and can be integrated with any MCP client. Example configuration:

```json
{
  "mcpServers": {
    "pikku-mcp": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "cwd": "/path/to/templates/modelcontrolprotocol"
    }
  }
}
```

## Example Tool Calls

### Say Hello

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "sayHello",
    "arguments": {
      "name": "Claude"
    }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"message\": \"Hello, Claude! This is a Pikku MCP tool.\", \"timestamp\": 1704067200000}"
      }
    ]
  }
}
```

### Calculate

```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "tools/call",
  "params": {
    "name": "calculate",
    "arguments": {
      "operation": "add",
      "a": 5,
      "b": 3
    }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"result\": 8, \"operation\": \"5 add 3 = 8\"}"
      }
    ]
  }
}
```

### Get User Info (Resource)

```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "resources/read",
  "params": {
    "uri": "user://123"
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "result": {
    "contents": [
      {
        "uri": "user://123",
        "mimeType": "application/json",
        "text": "{\"userId\": \"123\", \"name\": \"John Doe\", \"email\": \"john@example.com\", \"lastLogin\": \"2024-01-15T10:30:00Z\"}"
      }
    ]
  }
}
```

## Key Features Demonstrated

- **Unified MCP API**: Using `addMCPEndpoint()` with explicit type specification
- **Inline Type Definitions**: Using inline schemas instead of separate interfaces
- **Mixed Tool Types**: Both tools and resources in the same application
- **Automatic Schema Generation**: JSON schemas generated from TypeScript types
- **Full MCP Compliance**: Works with any MCP client using the official SDK
- **Error Handling**: Proper JSON-RPC 2.0 error responses
- **Type Safety**: Full TypeScript support throughout
- **Organized Output**: Files generated in organized directory structure

## Architecture

This template uses:

- **@pikku/core**: Core Pikku framework for function definitions
- **@pikku/cli**: Code generation for MCP schemas and bootstrap files
- **@pikku/mcp-server**: MCP server runtime using the official MCP SDK
- **stdio transport**: Standard input/output for MCP communication
- **JSON-RPC 2.0**: Compliant protocol implementation

## Extending

To add new MCP endpoints:

1. Define functions in `src/mcp.functions.ts` with inline types
2. Register them in `src/mcp.routes.ts` using `addMCPEndpoint()`
3. Run `yarn prebuild` to regenerate schemas
4. Restart the server

The Pikku CLI will automatically generate the necessary JSON schemas and bootstrap code.
