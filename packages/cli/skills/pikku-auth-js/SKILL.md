---
name: pikku-auth-js
description: 'Use when integrating Auth.js (NextAuth) with a Pikku app. Covers createAuthHandler, createAuthRoutes, and Auth.js configuration.
TRIGGER when: code uses createAuthHandler, createAuthRoutes, user asks about Auth.js, NextAuth, OAuth providers, or @pikku/auth-js.
DO NOT TRIGGER when: user asks about JWT middleware (use pikku-security) or custom session services (use pikku-services).'
---

# Pikku Auth.js Integration

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

`@pikku/auth-js` provides [Auth.js](https://authjs.dev/) integration for Pikku apps, handling OAuth providers, session management, and auth routes.

## Installation

```bash
yarn add @pikku/auth-js @auth/core
```

## API Reference

### `createAuthHandler(config)`

Creates a Pikku function that handles all Auth.js routes (signin, signout, callback, etc.):

```typescript
import { createAuthHandler } from '@pikku/auth-js'

const authHandler = createAuthHandler(
  config: AuthConfig | ((services: CoreSingletonServices) => AuthConfig | Promise<AuthConfig>)
)
// Returns: { func: CorePikkuFunctionSessionless }
```

The config can be static or a factory function that receives singleton services (useful for dynamic provider configuration).

### `createAuthRoutes(config, basePath?)`

Creates HTTP route contracts for Auth.js endpoints:

```typescript
import { createAuthRoutes } from '@pikku/auth-js'

const authRoutes = createAuthRoutes(
  config: AuthConfig | ((services) => AuthConfig | Promise<AuthConfig>),
  basePath?: string  // default: '/auth'
)
// Returns: HTTPRouteContract<HTTPRouteMap>
```

## Usage Patterns

### Basic Setup

```typescript
import { createAuthHandler, createAuthRoutes } from '@pikku/auth-js'
import GitHub from '@auth/core/providers/github'

const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
}

const authHandler = createAuthHandler(authConfig)
const authRoutes = createAuthRoutes(authConfig)
```

### Dynamic Config with Services

```typescript
const authHandler = createAuthHandler(async (services) => {
  const githubSecret = await services.secrets.getSecretJSON('github-oauth')
  return {
    providers: [
      GitHub({
        clientId: githubSecret.clientId,
        clientSecret: githubSecret.clientSecret,
      }),
    ],
  }
})
```

### Wiring Auth Routes

```typescript
import { wireHTTPRoute } from '@pikku/core/http'

// Auth routes are automatically wired when passed to your HTTP runner
const routes = [
  ...authRoutes,
  // ...your other routes
]
```
