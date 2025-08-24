# @pikku/create

A CLI tool for generating new Pikku projects from templates.

## Installation

```bash
# Using npm create (recommended)
npm create pikku@latest

# Using npx
npx @pikku/create

# Install globally
npm install -g @pikku/create
```

## Usage

### Interactive Mode

Simply run the command without arguments to be prompted for options:

```bash
npm create pikku@latest
```

### CLI Mode

Specify all options upfront to skip interactive prompts:

```bash
npm create pikku@latest -- --template express --name my-app --install --package-manager npm
```

## CLI Options

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--template <template>` | `-t` | Template to use | `--template express` |
| `--name <name>` | `-n` | Project name | `--name my-app` |
| `--install` | `-i` | Install dependencies automatically | `--install` |
| `--package-manager <manager>` | `-p` | Package manager to use | `--package-manager yarn` |
| `--version <version>` | `-v` | Template version/branch | `--version main` |
| `--yarn-link <path>` |  | Link to local Pikku development | `--yarn-link ../pikku` |
| `--stackblitz` |  | Add StackBlitz configuration | `--stackblitz` |
| `--help` | `-h` | Display help information | `--help` |

## Available Templates

### Server Templates

| Template | Description | Features |
|----------|-------------|----------|
| `aws-lambda` | AWS Lambda template | HTTP, Scheduled tasks |
| `aws-lambda-websocket` | Serverless WebSocket template | Channels (WebSockets) |
| `cloudflare-workers` | Cloudflare Workers template | HTTP, Scheduled tasks |
| `cloudflare-websocket` | Cloudflare WebSocket template | Channels (WebSockets) |
| `express` | Express.js server template | HTTP, Scheduled tasks, SSE |
| `express-middleware` | Express middleware template | HTTP, Scheduled tasks, SSE |
| `fastify` | Fastify server template | HTTP, SSE |
| `fastify-plugin` | Fastify plugin template | HTTP, SSE |
| `uws` | uWebSockets.js template | HTTP, Channels, Scheduled tasks |
| `ws` | WebSocket server template | HTTP, Channels, Scheduled tasks |

### Queue Templates

| Template | Description | Features |
|----------|-------------|----------|
| `bullmq` | BullMQ Redis queue template | Queue processing |
| `pg-boss` | PostgreSQL queue template | Queue processing |

### Full-Stack Templates

| Template | Description | Features |
|----------|-------------|----------|
| `nextjs` | Next.js hello world template | HTTP, Full-stack |
| `nextjs-full` | Next.js book application | HTTP, Full-stack |
| `yarn-workspace` | Complete workspace example | HTTP, Channels, Scheduled tasks, Full-stack |

### Specialized Templates

| Template | Description | Features |
|----------|-------------|----------|
| `mcp-server` | Model Context Protocol server | MCP |

## Package Managers

Supported package managers:
- `npm` - Most popular package manager
- `yarn` - What Pikku usually uses
- `bun` - Experimental support
- `pnpm` - Not currently available

## Examples

### Basic Express App

```bash
npm create pikku@latest -- --template express --name my-express-app --package-manager npm --install
```

### AWS Lambda with Scheduled Tasks

```bash
npm create pikku@latest -- --template aws-lambda --name my-lambda-app --package-manager yarn --install
```

### Development with Local Pikku

```bash
npm create pikku@latest -- --template express-middleware --name test-app --package-manager yarn --yarn-link /path/to/pikku --install
```

### StackBlitz Ready Project

```bash
npm create pikku@latest -- --template nextjs --name stackblitz-app --stackblitz --package-manager npm
```

### Full Workspace

```bash
npm create pikku@latest -- --template yarn-workspace --name my-workspace --package-manager yarn --install
```

## Features

The CLI automatically filters files based on the template's supported features:

- **HTTP**: REST API endpoints and HTTP handlers
- **Scheduled**: Cron-like scheduled task execution
- **Channels**: WebSocket-like real-time communication
- **SSE**: Server-Sent Events for streaming
- **Queue**: Background job processing
- **MCP**: Model Context Protocol endpoints
- **Full-stack**: Complete web applications

Only files relevant to the selected template's features will be included in your project.

## Development

For local development and testing:

```bash
# Build the package
yarn build

# Test with a specific template
node ./dist/index.js --template express-middleware --name test-app --install
```