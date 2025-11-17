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
import { pikkuFunc } from '../pikku-types.gen.js'

const addGithubStar = pikkuFunc<
  { repo: string },
  { success: boolean; repo: string }
>({
  func: async ({ githubService }, { repo }, session) => {
    await githubService.addStar(repo, session.userId)
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
import {
  CreateSingletonServices,
  CreateWireServices,
} from '../pikku-types.gen.js'
import { ConsoleLogger, JWTService } from '@pikku/core/services'

// Singleton services - created once at startup
export const createSingletonServices: CreateSingletonServices = async (
  config
) => {
  const logger = new ConsoleLogger()
  const db = new DatabaseClient()
  const jwt = new JWTService(['your-secret-key'], logger)

  return { logger, db, jwt }
}

// Wire services - created per request
export const createWireServices: CreateWireServices = async (
  services,
  interaction,
  session
) => {
  return {
    scopedLogger: new ScopedLogger(session.userId),
  }
}
```

### Type Generation

Pikku automatically generates type-safe clients from your API definitions:

```bash
npx pikku prebuild
```

Generates:

- `pikku-fetch.gen.ts` - HTTP client
- `pikku-websocket.gen.ts` - WebSocket client
- Full TypeScript definitions

## Runtime Support

Pikku works across multiple runtime environments:

| Runtime            | Status | Package                     |
| ------------------ | ------ | --------------------------- |
| Express            | ✅     | `@pikku/express`            |
| Fastify            | ✅     | `@pikku/fastify`            |
| Next.js            | ✅     | `@pikku/nextjs`             |
| AWS Lambda         | ✅     | `@pikku/aws-lambda`         |
| Cloudflare Workers | ✅     | `@pikku/cloudflare-workers` |
| Bun                | ✅     | `@pikku/bun`                |

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

Wire it as an MCP tool:

```ts
wireMCPTool({
  name: 'github-star',
  description: 'Add a star to a GitHub repository',
  func: addGithubStar,
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

Migration guides are available in [docs/MIGRATION.md](docs/MIGRATION.md).

## Contributing

We welcome contributions! See our [Contributing Guide](docs/CONTRIBUTING.md) for details on:

- Setting up the development environment
- Running tests and type checking
- Submitting pull requests
- Creating runtime adapters

## Community

- [GitHub Discussions](https://github.com/pikkujs/pikku/discussions)
- [Discord Server](https://discord.com/invite/z7r4rhwJ)
- [X/Twitter](https://x.com/pikkujs)

## Contributors

Thanks to [all contributors](https://github.com/yourusername/pikku/graphs/contributors)!

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

<div align="center">
  <p>Built with ❤️ for the Typescript community</p>
</div>
