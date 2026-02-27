---
name: pikku-config
description: 'Use when managing secrets, environment variables, config, OAuth2 credentials, or API versioning in a Pikku app. Covers wireSecret, wireVariable, wireOAuth2Credential, typed config access, and contract versioning.'
---

# Pikku Config, Secrets & Versioning

Manage secrets, variables, OAuth2 credentials, and API contract versioning. Never use `process.env` in Pikku functions — use typed services instead.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their versions
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## Secrets & Variables

### `wireSecret(config)`

Declare a secret with a Zod schema for type-safe access:

```typescript
wireSecret({
  name: string, // Secret identifier
  schema: ZodSchema, // Shape and validation
})
```

### `wireVariable(config)`

Declare a variable (non-sensitive config) with a Zod schema:

```typescript
wireVariable({
  name: string,
  schema: ZodSchema,
})
```

### Accessing in Functions

```typescript
// Secrets — encrypted, sensitive values
const config = await services.secrets.getSecretJSON('SECRET_NAME')

// Variables — plain-text configuration
const flags = await services.variables.getVariableJSON('VARIABLE_NAME')

// Simple string access
const apiKey = services.variables.get('API_KEY')
```

### Local Development Services

```typescript
import { LocalSecretService, LocalVariablesService } from '@pikku/core'

const createSingletonServices = pikkuServices(async (config) => ({
  secrets: new LocalSecretService(), // Reads from .env or local files
  variables: new LocalVariablesService(), // Reads from environment
}))
```

### Usage Patterns

```typescript
// Declare secrets with typed schemas
wireSecret({
  name: 'STRIPE_CONFIG',
  schema: z.object({
    apiKey: z.string().startsWith('sk_'),
    webhookSecret: z.string(),
  }),
})

// In your function — fully typed
const config = await secrets.getSecretJSON('STRIPE_CONFIG')
// config.apiKey       → string (autocompleted)
// config.webhookSecret → string (autocompleted)

// Declare variables
wireVariable({
  name: 'FEATURE_FLAGS',
  schema: z.object({
    darkMode: z.boolean(),
    maxUploadMB: z.number().default(10),
  }),
})

// Read it — typed and validated
const flags = await variables.getVariableJSON('FEATURE_FLAGS')
// flags.darkMode    → boolean
// flags.maxUploadMB → number
```

## OAuth2 Credentials

### `wireOAuth2Credential(config)`

```typescript
wireOAuth2Credential({
  name: string,              // Credential identifier
  displayName: string,       // Human-readable name
  secretId: string,          // Secret holding { clientId, clientSecret }
  tokenSecretId: string,     // Secret for token storage (auto-refreshed)
  authorizationUrl: string,  // OAuth2 authorization endpoint
  tokenUrl: string,          // OAuth2 token endpoint
  scopes: string[],          // Required OAuth2 scopes
})
```

### Usage

```typescript
wireOAuth2Credential({
  name: 'slackOAuth',
  displayName: 'Slack OAuth',
  secretId: 'SLACK_OAUTH_APP',
  tokenSecretId: 'SLACK_OAUTH_TOKENS',
  authorizationUrl: 'https://slack.com/oauth/v2/authorize',
  tokenUrl: 'https://slack.com/api/oauth.v2.access',
  scopes: ['chat:write', 'channels:read'],
})

// In your function — tokens refresh automatically
const response = await slackOAuth.request(
  'https://slack.com/api/chat.postMessage',
  {
    method: 'POST',
    body: JSON.stringify({ channel, text }),
  }
)
const data = await response.json()
```

## API Versioning

### Function Versioning

Add `version` to function config to maintain backward compatibility:

```typescript
// v1 — kept for running workflows and agents
const getBookV1 = pikkuFunc({
  title: 'Get Book',
  version: 1,
  input: z.object({ bookId: z.string() }),
  output: z.object({ title: z.string() }),
  func: async ({ db }, { bookId }) => {
    return await db.getBook(bookId)
  },
})

// v2 — the latest version, called by default
const getBook = pikkuFunc({
  title: 'Get Book',
  input: z.object({
    bookId: z.string(),
    format: z.enum(['full', 'summary']),
  }),
  output: z.object({
    title: z.string(),
    author: z.string(),
    isbn: z.string(),
  }),
  func: async ({ db }, { bookId, format }) => {
    return await db.getBook(bookId, format)
  },
})
```

### Version Manifest (`versions.json`)

Pikku tracks contract hashes to detect breaking changes:

```json
{
  "manifestVersion": 1,
  "contracts": {
    "createTodo": {
      "latest": 1,
      "versions": {
        "1": "a1b2c3d4e5f6g7h8"
      }
    },
    "getTodos": {
      "latest": 2,
      "versions": {
        "1": "i9j0k1l2m3n4o5p6",
        "2": "q7r8s9t0u1v2w3x4"
      }
    }
  }
}
```

### CLI Commands

```bash
npx pikku versions init     # Initialize versioning manifest
npx pikku versions check    # Detect contract changes (use in CI)
npx pikku versions update   # Update contract hashes after version bump
```

### CI Integration

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx pikku versions check
```

## Key Rule

**Never use `process.env` inside Pikku functions.** Use the `variables` or `secrets` service:

```typescript
// ❌ Wrong
const apiKey = process.env.API_KEY

// ✅ Correct
const apiKey = services.variables.get('API_KEY')
```

`process.env` belongs only in server bootstrap code (`start.ts`).

## Complete Example

```typescript
// schemas/config.ts
wireSecret({
  name: 'DATABASE_CONFIG',
  schema: z.object({
    connectionString: z.string().url(),
    maxPoolSize: z.number().default(10),
  }),
})

wireVariable({
  name: 'APP_CONFIG',
  schema: z.object({
    appName: z.string(),
    maxUploadSizeMB: z.number().default(10),
    maintenanceMode: z.boolean().default(false),
  }),
})

wireOAuth2Credential({
  name: 'githubOAuth',
  displayName: 'GitHub OAuth',
  secretId: 'GITHUB_OAUTH_APP',
  tokenSecretId: 'GITHUB_OAUTH_TOKENS',
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: ['read:user', 'repo'],
})

// functions/admin.functions.ts
export const getAppStatus = pikkuSessionlessFunc({
  title: 'Get App Status',
  func: async ({ variables, secrets }) => {
    const appConfig = await variables.getVariableJSON('APP_CONFIG')
    return {
      appName: appConfig.appName,
      maintenanceMode: appConfig.maintenanceMode,
    }
  },
})
```
