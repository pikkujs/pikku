---
name: pikku-auth-js
description: 'Use when integrating Auth.js (NextAuth) with a Pikku app. Covers createAuthHandler, createAuthRoutes, and Auth.js configuration.
TRIGGER when: code uses createAuthHandler, createAuthRoutes, user asks about Auth.js, NextAuth, OAuth providers, or @pikku/auth-js.
DO NOT TRIGGER when: user asks about JWT middleware (use pikku-security) or custom session services (use pikku-services).'
---

# Pikku Auth.js Integration

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
