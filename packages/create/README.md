# create-pikku

A CLI tool for generating new Pikku projects from templates.

## Installation

```bash
# Using npm create (recommended)
npm create pikku@latest

# Using npx
npx create-pikku

# Install globally
npm install -g create-pikku
```

## Usage

### Default Mode

Running without arguments scaffolds the default starter template, keeps the
default frontend, installs dependencies with [Bun](https://bun.sh), runs Pikku
setup and runs `bun run dev`:

```bash
npm create pikku@latest
```

By default this creates `./my-app`. Use `--name` to override it.

The starter template is downloaded from
[`pikkujs/starter-template`](https://github.com/pikkujs/starter-template) at the
commit this release of `create-pikku` pins. `--version <ref>` downloads another
branch, tag or commit of that repository instead. For every other template,
`--version` names a ref of `pikkujs/pikku` (of `pikkujs/nextjs-app-starter` for
`nextjs-full`), and the default is `main`.

If a downloaded template is empty or has no `package.json`, `create-pikku` exits
with a non-zero status and creates no project.

The starter template uses Bun. It accepts no `--package-manager` other than `bun`
and no `--yarn-link`, and `create-pikku` stops before downloading if you pass
either, or if it is going to install and `bun` cannot be run.

`create-pikku` does not create the starter's database. Before the first
`bun run dev`, run these in the project, as `create-pikku` prints them:

```bash
bunx --bun pikku db generate
bunx --bun pikku db migrate
```

With `--skip-install`, run `bun install` and `bunx --bun pikku all` before them.

For every template, if installing or a setup step fails, `create-pikku` exits with
a non-zero status and does not report the setup as complete. The project files
stay in place.

### Variations Mode

Use `--variations` to access the full template picker and interactive options:

```bash
npm create pikku@latest -- --variations
```

### CLI Mode

Specify all options upfront to skip interactive prompts:

```bash
npm create pikku@latest -- --template express --name my-app --install --package-manager npm
```

## CLI Options

| Option                        | Short | Description                           | Example                  |
| ----------------------------- | ----- | ------------------------------------- | ------------------------ |
| `--template <template>`       | `-t`  | Template to use                       | `--template express`     |
| `--name <name>`               | `-n`  | Project name                          | `--name my-app`          |
| `--install`                   | `-i`  | Install dependencies automatically    | `--install`              |
| `--package-manager <manager>` | `-p`  | Package manager to use                | `--package-manager yarn` |
| `--version <version>`         | `-v`  | Template ref (branch, tag or commit)  | `--version main`         |
| `--yarn-link <path>`          |       | Link to local Pikku development       | `--yarn-link ../pikku`   |
| `--variations`                |       | Show all template variations          | `--variations`           |
| `--frontend <frontend>`       |       | Frontend to keep for starter template | `--frontend app`         |
| `--help`                      | `-h`  | Display help information              | `--help`                 |

## Available Templates

### Server Templates

| Template               | Description                   | Features                        |
| ---------------------- | ----------------------------- | ------------------------------- |
| `aws-lambda`           | AWS Lambda template           | HTTP, Scheduled tasks           |
| `aws-lambda-websocket` | Serverless WebSocket template | Channels (WebSockets)           |
| `cloudflare-workers`   | Cloudflare Workers template   | HTTP, Scheduled tasks           |
| `cloudflare-websocket` | Cloudflare WebSocket template | Channels (WebSockets)           |
| `express`              | Express.js server template    | HTTP, Scheduled tasks, SSE      |
| `express-middleware`   | Express middleware template   | HTTP, Scheduled tasks, SSE      |
| `fastify`              | Fastify server template       | HTTP, SSE                       |
| `fastify-plugin`       | Fastify plugin template       | HTTP, SSE                       |
| `uws`                  | uWebSockets.js template       | HTTP, Channels, Scheduled tasks |
| `ws`                   | WebSocket server template     | HTTP, Channels, Scheduled tasks |

### Queue Templates

| Template  | Description                 | Features         |
| --------- | --------------------------- | ---------------- |
| `bullmq`  | BullMQ Redis queue template | Queue processing |
| `pg-boss` | PostgreSQL queue template   | Queue processing |

### Full-Stack Templates

| Template           | Description                  | Features         |
| ------------------ | ---------------------------- | ---------------- |
| `nextjs`           | Next.js hello world template | HTTP, Full-stack |
| `nextjs-full`      | Next.js book application     | HTTP, Full-stack |
| `starter-template` | Opinionated starter template | HTTP, Full-stack |

### Specialized Templates

| Template     | Description                   | Features |
| ------------ | ----------------------------- | -------- |
| `mcp-server` | Model Context Protocol server | MCP      |

## Package Managers

Supported package managers:

- `npm` - Most popular package manager
- `yarn` - What Pikku usually uses
- `bun` - Experimental support (required by the starter template)
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

### Starter Template

```bash
npm create pikku@latest -- --template starter-template --frontend app --name my-app
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
