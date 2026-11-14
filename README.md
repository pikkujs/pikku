<div align="center">
  <h1>🦎 Pikku</h1>
  <p><em><strong>TypeScript-powered framework that normalizes Node.js server interactions</strong></em></p>
</div>

<hr />

[![Bundle Size](https://img.shields.io/bundlephobia/min/@pikku/core)](https://bundlephobia.com/result?p=@pikku/core)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/m/pikkujs/pikku)](https://github.com/pikkujs/pikku/pulse)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)

Pikku is a TypeScript-powered framework that normalizes all the different ways you can interact with Node.js servers. It provides a unified approach to handling HTTP requests, WebSocket connections, scheduled tasks, and channels across different runtime environments.

**Type-safe, runtime-agnostic, batteries included.**

## Quick Start

```bash
npm create pikku@latest my-app
cd my-app
npm run dev
```

## Features

- **🔐 Type Safety** - Full TypeScript support with auto-generated type-safe clients
- **🌍 Runtime Agnostic** - Works on Express, Fastify, Next.js, AWS Lambda, Cloudflare Workers, and more
- **⚡ Performance Optimized** - Smart routing with static route optimization and middleware caching
- **🔋 Batteries Included** - HTTP handlers, WebSocket channels, scheduled tasks, and pub/sub out of the box
- **🛠️ Great DX** - Code generation, OpenAPI docs, and excellent tooling support
- **🎯 Unified API** - Handle data from params, query, or body without knowing the source

## Core Concepts

### PikkuFunc - The Heart of Pikku

At the core of Pikku is the `pikkuFunc` - a unified function that handles data from any source:

```ts
import { pikkuFunc } from '#pikku/function'

const addGithubStar = pikkuFunc<
  { repo: string },
  { success: boolean; repo: string }
>({
  func: async ({ githubService }, { repo }, { session }) => {
    const currentSession = await session?.get()
    await githubService.addStar(repo, currentSession.userId)
    return { success: true, repo }
  },
  auth: true, // Whether a session is needed for function to be invoked
  permissions: {}, // Permissions to run before function is invoked
  middleware: [logUsage, rateLimit], // Middleware to wrap functions
  docs: {
    name: 'Github star',
    description: 'Used to add stars to repos!',
  },
  expose: true, // Expose this function via RPC
})
```

### Services - Dependency Injection Made Simple

Services are initialized at server startup and available to all functions. Pikku uses two types of services:

```ts
import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import { ConsoleLogger, LocalVariablesService } from '@pikku/core/services'

// Singleton services - created once at startup
export const createSingletonServices = pikkuServices(async (config) => {
  const variables = new LocalVariablesService()
  const logger = new ConsoleLogger()
  const db = new DatabaseClient()

  return { variables, logger, db }
})

// Wire services - created per request
export const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => {
    return {}
  }
)
```

### Type Generation

Pikku automatically generates type-safe clients from your API definitions:

```bash
npx pikku all
```

Generates:

- `pikku-fetch.gen.ts` - HTTP client
- `pikku-websocket.gen.ts` - WebSocket client
- Full TypeScript definitions

## Runtime Support

Pikku works across multiple runtime environments:

| Runtime                | Package                                       |
| ---------------------- | --------------------------------------------- |
| Express                | `@pikku/express`, `@pikku/express-middleware` |
| Fastify                | `@pikku/fastify`, `@pikku/fastify-plugin`     |
| Next.js                | `@pikku/next`                                 |
| TanStack Start         | `@pikku/tanstack-start`                       |
| AWS Lambda             | `@pikku/lambda`                               |
| Azure Functions        | `@pikku/azure-functions`                      |
| Cloudflare Workers     | `@pikku/cloudflare`                           |
| Bun                    | `@pikku/bun-server`                           |
| Node.js HTTP           | `@pikku/node-http-server`                     |
| uWebSockets.js         | `@pikku/uws`, `@pikku/uws-handler`            |
| WebSockets (`ws`)      | `@pikku/ws`                                   |
| Model Context Protocol | `@pikku/modelcontextprotocol`                 |

## Example: One Function, Multiple Ways

Wire it up to HTTP:

```ts
wireHTTP({
  route: '/api/github/star',
  method: 'post',
  func: addGithubStar,
  auth: true,
})
```

Wire it to WebSocket channels:

```ts
wireChannel({
  route: '/ws/github',
  name: 'github-api',
  onMessage: {
    addStar: addGithubStar,
  },
  auth: true,
})
```

Wire it to queue processing:

```ts
wireQueueWorker({
  name: 'github-star-queue',
  func: addGithubStar,
})
```

Offer it as an MCP tool by setting `mcp: true` on the function:

```ts
const addGithubStar = pikkuFunc<{ repo: string }, { success: boolean }>({
  func: async ({ githubService }, { repo }) => {
    /* … */
  },
  mcp: true,
})
```

Wire a scheduled task (different function since no input/output):

```ts
const logStarCount = pikkuVoidFunc(async ({ githubService, logger }) => {
  const count = await githubService.getTotalStars()
  logger.info(`Total GitHub stars: ${count}`)
})

wireScheduler({
  name: 'star-counter',
  schedule: '0 0 * * *', // daily
  func: logStarCount,
})
```

## Documentation

The documentation is available at [pikku.dev](https://pikku.dev).

## Migration

Upgrading from an earlier 0.12 release? See [docs/MIGRATION.md](docs/MIGRATION.md).

## Contributing

**We are not accepting code pull requests for now.** The best way to help is a detailed issue: ask your AI assistant to write it with what you saw, what you expected, steps to reproduce, the relevant code or logs, and your suggested fix. We will pick it up and fix it ourselves. A contributor licence agreement will be introduced later.

The repository is a [bun](https://bun.sh/) workspace (bun 1.4, Node.js 24 or later):

```bash
bun install
bun run build:packages
bun run test
```

See our [Contributing Guide](docs/CONTRIBUTING.md) for details on:

- Setting up the development environment
- Running tests and type checking
- Creating runtime adapters

## Community

- [GitHub Discussions](https://github.com/pikkujs/pikku/discussions)
- [Discord Server](https://discord.com/invite/z7r4rhwJ)
- [X/Twitter](https://x.com/pikkujs)

## Contributors

Thanks to [all contributors](https://github.com/pikkujs/pikku/graphs/contributors)!

## License

- **MIT**: the framework and everything that ends up in your app: `@pikku/core`, the runtimes, the services, the clients, `@pikku/react`, `@pikku/vite`, the addons (`@pikku/addon-*`), `@pikku/skills` and every other package not listed below.
- **AGPL-3.0-only**: the tools that build your app: the CLI (`@pikku/cli`), the inspectors (`@pikku/inspector`, `@pikku/inspector-go` and the Rust inspector) and Pikku Studio.

Each package ships its own LICENSE file, which governs it. [LICENSE](LICENSE) is the map.

**Output of the CLI.** _[LAWYER: draft wording, not yet reviewed]_ The code, types and files the CLI generates into your project are not covered by the AGPL. You can license them however you like.

**Other licensing.** If the AGPL-3.0 does not work for you, other licensing is available: contact [CONTACT EMAIL]. See [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).

**Contributing.** We are not accepting code pull requests for now. Please open a detailed issue instead (see [CONTRIBUTING](docs/CONTRIBUTING.md)). A contributor licence agreement ([draft](CLA.md)) will be introduced later.

---

<div align="center">
  <p>Built with ❤️ for the Typescript community</p>
</div>
