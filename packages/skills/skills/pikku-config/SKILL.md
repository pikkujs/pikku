---
name: pikku-config
description: >-
  Use when managing secrets, environment variables, config, or OAuth2 credentials in a Pikku app.
  Covers defineSecret, defineVariable, defineCredential, and typed config access. TRIGGER when:
  code uses defineSecret/defineVariable/defineCredential, user asks about env vars, secrets,
  config, OAuth2, or "how do I access environment variables". DO NOT TRIGGER when: user asks about
  API versioning/breaking changes (use pikku-versioning), service factories (use pikku-services),
  or auth middleware (use pikku-security).
installGroups: [core]
---

# Pikku Config, Secrets & OAuth2

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Manage secrets, variables, and OAuth2 credentials. Never use `process.env` in Pikku functions — use typed services instead.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their versions
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## Secrets & Variables

### `defineSecret(config)`

Declare a secret with a Zod schema for type-safe access:

```typescript
defineSecret({
  name: string, // Secret identifier
  schema: ZodSchema, // Shape and validation
})
```

### `defineVariable(config)`

Declare a variable (non-sensitive config) with a Zod schema:

```typescript
defineVariable({
  name: string,
  schema: ZodSchema,
})
```

### Accessing in Functions

```typescript
// Secrets — encrypted, sensitive values
const config = await services.secrets.getSecret('SECRET_NAME')

// Variables — plain-text configuration
const flags = await services.variables.getVariableJSON('VARIABLE_NAME')

// Simple string access
const apiKey = services.variables.get('API_KEY')
```

### Local Development Services

```typescript
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'

const createSingletonServices = pikkuServices(async (config) => ({
  secrets: new LocalSecretService(), // Reads from .env or local files
  variables: new LocalVariablesService(), // Reads from environment
}))
```

### Usage Patterns

```typescript
// Declare secrets with typed schemas
defineSecret({
  name: 'STRIPE_CONFIG',
  schema: z.object({
    apiKey: z.string().startsWith('sk_'),
    webhookSecret: z.string(),
  }),
})

// In your function — fully typed
const config = await secrets.getSecret('STRIPE_CONFIG')
// config.apiKey       → string (autocompleted)
// config.webhookSecret → string (autocompleted)

// Declare variables
defineVariable({
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

## Credentials

### `defineCredential(config)`

```typescript
defineCredential({
  name: string,                  // Credential identifier
  displayName: string,           // Human-readable name
  type: 'wire' | 'singleton',    // Per-user ('wire') or platform-level ('singleton')
  schema: ZodSchema,             // Shape of the stored credential
  oauth2?: {                     // Omit entirely for a plain API key
    appCredentialSecretId: string, // Secret holding { clientId, clientSecret }
    tokenSecretId: string,         // Secret for token storage (auto-refreshed)
    authorizationUrl: string,      // OAuth2 authorization endpoint
    tokenUrl: string,              // OAuth2 token endpoint
    scopes: string[],              // Required OAuth2 scopes
  },
})
```

### Usage

```typescript
// Per-user API key — no oauth2 block
defineCredential({
  name: 'stripe',
  displayName: 'Stripe API Key',
  type: 'wire',
  schema: z.object({ apiKey: z.string() }),
})

// Platform-level OAuth (singleton)
defineCredential({
  name: 'slack',
  displayName: 'Slack',
  type: 'singleton',
  schema: z.object({ accessToken: z.string(), refreshToken: z.string() }),
  oauth2: {
    appCredentialSecretId: 'SLACK_OAUTH_APP',
    tokenSecretId: 'SLACK_OAUTH_TOKENS',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'channels:read'],
  },
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
defineSecret({
  name: 'DATABASE_CONFIG',
  schema: z.object({
    connectionString: z.string().url(),
    maxPoolSize: z.number().default(10),
  }),
})

defineVariable({
  name: 'APP_CONFIG',
  schema: z.object({
    appName: z.string(),
    maxUploadSizeMB: z.number().default(10),
    maintenanceMode: z.boolean().default(false),
  }),
})

defineCredential({
  name: 'githubOAuth',
  displayName: 'GitHub OAuth',
  type: 'wire',
  schema: z.object({ accessToken: z.string(), refreshToken: z.string() }),
  oauth2: {
    appCredentialSecretId: 'GITHUB_OAUTH_APP',
    tokenSecretId: 'GITHUB_OAUTH_TOKENS',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'repo'],
  },
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
