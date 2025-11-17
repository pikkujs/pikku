# Pikku CLI Template

This template demonstrates **two different approaches** to building CLI applications with Pikku:

1. **Local CLI** - Traditional command-line interface that executes directly in the local process
2. **Remote CLI (via Channels)** - WebSocket-based CLI where commands execute on a remote server

Both approaches share the same business logic and demonstrate Pikku's transport-agnostic architecture.

## Quick Start

### 1. Install Dependencies

```bash
yarn install
```

### 2. Generate Pikku Files

```bash
yarn pikku
```

This generates three key files:

- `.pikku/cli-local.gen.ts` - Local CLI executable
- `.pikku/cli-channel.ts` - WebSocket channel backend
- `.pikku/cli-remote.gen.ts` - Remote CLI client

### 3. Run Local CLI

```bash
# Show help
yarn cli --help

# Run a command
yarn cli greet Claude

# Run with options
yarn cli greet Claude --loud

# Nested commands
yarn cli calc add 5 3
yarn cli user list --limit 10
```

### 4. Run Remote CLI (via Channel)

First, you'll need a WebSocket server running (see templates/functions for a full example with server).

```bash
# Set the WebSocket URL (optional, defaults to ws://localhost:3000/cli)
export PIKKU_WS_URL=ws://localhost:3000/cli

# Run remote CLI
yarn cli:remote greet Claude
```

## Architecture

### Local CLI (Traditional)

**How it works:**

- CLI commands execute directly in the local Node.js process
- Uses `executeCLI()` from `@pikku/core/cli`
- Fastest execution, no network overhead
- Full access to local filesystem and resources

**Generated file:** `.pikku/cli-local.gen.ts`

**Best for:**

- Local development tools
- File system operations
- Git operations
- Build tools and scripts
- Configuration management
- Fast, synchronous operations

### Remote CLI (via Channels)

**How it works:**

- CLI client parses arguments locally
- Connects to WebSocket server
- Sends command + data to server
- Server executes function
- Results stream back to client
- Renderers run on client to format output

**Generated files:**

- `.pikku/cli-channel.ts` - Server-side channel handler
- `.pikku/cli-remote.gen.ts` - Client executable

**Best for:**

- Remote server management
- Database operations on remote servers
- Distributed systems
- Real-time progress updates
- Multi-server orchestration
- Operations requiring server-side authentication

## Configuration

The key to this template is the `pikku.config.json` file:

```json
{
  "srcDirectories": ["../functions/src"],
  "cli": {
    "entrypoints": {
      "my-cli": [
        {
          "type": "local",
          "path": ".pikku/cli-local.gen.ts"
        },
        {
          "type": "channel",
          "name": "cli",
          "route": "/cli",
          "wirePath": ".pikku/cli-channel.ts",
          "path": ".pikku/cli-remote.gen.ts"
        }
      ]
    }
  }
}
```

**Key points:**

- `srcDirectories`: Points to `../functions/src` to reuse existing CLI functions
- `entrypoints`: Maps the program name (`my-cli`) to both CLI and channel configurations
- Both approaches share the same functions from templates/functions

## Available Commands

This template uses the CLI commands defined in `templates/functions`:

### greet

```bash
yarn cli greet <name> [--loud]
```

Simple greeting command with optional loud flag.

### calc

```bash
yarn cli calc add <a> <b>
yarn cli calc subtract <a> <b>
yarn cli calc multiply <a> <b>
yarn cli calc divide <a> <b>
```

Mathematical calculator with subcommands.

### user

```bash
yarn cli user create <username> <email> [--admin]
yarn cli user list [--limit <n>] [--admin]
```

User management commands.

### file

```bash
yarn cli file <path> [--action <action>] [--backup]
```

File operations.

## Comparison: Local vs Remote

| Feature              | Local CLI            | Remote CLI (Channel)      |
| -------------------- | -------------------- | ------------------------- |
| **Execution**        | Local process        | Remote server             |
| **Latency**          | Instant              | Network latency           |
| **Authentication**   | Not needed           | Server-side auth possible |
| **File Access**      | Local filesystem     | Server filesystem         |
| **Progress Updates** | Via console          | Real-time streaming       |
| **Resource Access**  | Local only           | Server resources          |
| **Offline**          | Works offline        | Requires connection       |
| **Best for**         | Local tools, scripts | Remote operations, APIs   |

## How Pikku Makes This Possible

### Transport-Agnostic Functions

The CLI functions in `templates/functions/src/cli.functions.ts` are written once:

```typescript
export const greetUser: CorePikkuFunc<
  { name: string; loud?: boolean },
  { message: string; timestamp: string }
> = async (_services, data) => {
  let message = `Hello, ${data.name}!`
  if (data.loud) {
    message = message.toUpperCase()
  }
  return { message, timestamp: new Date().toISOString() }
}
```

### Shared Renderers

Renderers format output and work with both approaches:

```typescript
export const greetRenderer = pikkuCLIRender<{
  message: string
  timestamp: string
}>((_services, output) => {
  console.log(output.message)
  console.log(`Generated at: ${output.timestamp}`)
})
```

**Important:** For remote CLI, renderers must be **service-free** (they can't depend on services) since they execute on the client.

### Automatic Code Generation

Pikku CLI automatically generates:

1. **Type-safe executables** for both local and remote
2. **Channel wiring** for WebSocket backend
3. **Renderer mapping** for remote client
4. **Argument parsing** for both approaches

## Extending This Template

### 1. Add New Commands

Add functions to `templates/functions/src/cli.functions.ts`:

```typescript
export const newCommand: CorePikkuFunc<Input, Output> = async (
  services,
  data
) => {
  // Your logic here
}
```

### 2. Wire the Command

Update `templates/functions/src/cli.wiring.ts`:

```typescript
wireCLI({
  program: 'my-cli',
  commands: {
    new: pikkuCLICommand({
      parameters: '<arg>',
      func: newCommand,
      render: newRenderer,
    }),
  },
})
```

### 3. Regenerate

```bash
yarn pikku
```

Both local and remote CLI automatically include your new command!

## Advanced: Multiple CLI Programs

You can define multiple CLI programs:

```json
{
  "cli": {
    "entrypoints": {
      "admin-cli": [
        {
          "type": "local",
          "path": ".pikku/admin-local.gen.ts"
        }
      ],
      "user-cli": [
        {
          "type": "local",
          "path": ".pikku/user-local.gen.ts"
        }
      ]
    }
  }
}
```

Each program can have its own set of commands and entrypoints.

## Setting Up a WebSocket Server

To use the remote CLI, you need a WebSocket server. See `templates/functions` for a complete example with:

- Express server setup
- WebSocket channel wiring
- Authentication (optional)
- Full CLI + HTTP + WebSocket integration

Basic server setup:

```typescript
import { createPikkuExpressApp } from '@pikku/express'
import '../.pikku/cli-channel.gen.js' // Import channel wiring

const app = createPikkuExpressApp({
  createConfig,
  createSingletonServices,
  createWireServices,
})

app.listen(3000)
```

## Troubleshooting

### "Program not found" Error

Make sure the program name in `pikku.config.json` matches the name in your `wireCLI()` call:

```typescript
// In cli.wiring.ts
wireCLI({
  program: 'my-cli', // Must match
  // ...
})
```

```json
// In pikku.config.json
{
  "cli": {
    "entrypoints": {
      "my-cli": [
        /* ... */
      ] // Must match
    }
  }
}
```

### "Renderers cannot depend on services" Error

For remote CLI, renderers execute on the client and can't access server services. Make sure your renderers don't use the `services` parameter:

```typescript
// ✅ Good (no services)
export const renderer = pikkuCLIRender((_, data) => {
  console.log(data.message)
})

// ❌ Bad (uses services)
export const renderer = pikkuCLIRender((services, data) => {
  services.logger.info(data.message) // Won't work in remote CLI
})
```

### Connection Errors with Remote CLI

Make sure:

1. WebSocket server is running
2. `PIKKU_WS_URL` points to the correct URL
3. The channel route matches (default: `/cli`)

## Resources

- [Pikku Documentation](https://github.com/pikkujs/pikku)
- [CLI Documentation](../../packages/cli/README.md)
- [Functions Template](../functions/README.md) - Full example with server
- [Express Template](../express/README.md) - HTTP server example

## License

MIT
