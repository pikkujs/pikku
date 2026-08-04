---
name: pikku-config
description: >-
  Use when managing secrets, environment variables, config, or OAuth2 credentials in a Pikku app.
  Covers defineSecret, defineVariable, defineCredential, and typed config access. TRIGGER when:
  code uses defineSecret/defineVariable/defineCredential, user asks about env vars, secrets,
  config, OAuth2, SecretValue/.reveal(), SecretCoercionError, or "how do I access environment
  variables". DO NOT TRIGGER when: user asks about API versioning/breaking changes (use
  pikku-versioning), service factories (use pikku-services), middleware (use pikku-middleware), or
  auth strategies and sessions (use pikku-security).
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

### Accessing Secrets

`secrets` is **not available inside functions, AI agents, workflows, permissions
or any wire** — it is removed from their services type and throws at runtime if
reached through a cast. Read it where you wire the app and hand the value to a
service:

`getSecret` returns a `SecretValue<T>`, not the bare value. It is nominal — not
assignable to `string`, so every concretely-typed sink rejects it — it serializes
to `[secret]` in logs and audits, and coercing it to a string (a template
literal, a concatenation) throws `SecretCoercionError`, because that is always a
leak. `.reveal()` is the one way out, which makes every disclosure deliberate and
greppable. Call it at the point the value reaches the thing that needs it:

```typescript
// services.ts — allowed
const createSingletonServices = pikkuServices(async (config, { secrets }) => ({
  stripe: new StripeService((await secrets.getSecret('STRIPE_CONFIG')).reveal()),
}))

// functions/*.ts — ask the service, never the secret store
export const charge = pikkuFunc({
  func: async ({ stripe }, data) => stripe.charge(data.amount),
})
```

Allowed: `pikkuServices`, `pikkuWireServices`, addon service factories,
middleware. Everywhere else, the service you constructed is the interface.

### Accessing Variables in Functions

```typescript
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

// In your services factory — fully typed
const config = (await secrets.getSecret('STRIPE_CONFIG')).reveal()
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

### Reading a Credential

A declared credential is resolved per invocation through `wire.getCredential(name)`,
so the natural place to read it is a wire service factory: build the client there
once and let functions ask the client, the same way they ask a service for a
secret-derived value. Tokens refresh automatically, so what arrives is already
valid.

```typescript
export const createWireServices = pikkuWireServices(async (_services, wire) => {
  const cred = await wire.getCredential?.<{ accessToken: string }>('slack')
  if (!cred?.accessToken) {
    // Tells the caller which credential to connect, and where.
    throw new MissingCredentialError('slack', 'oauth2', '/credentials/slack/connect')
  }
  return { slack: new SlackClient(cred.accessToken) }
})

// functions/*.ts — ask the client, never the credential store
export const postMessage = pikkuFunc({
  func: async ({ slack }, { channel, text }) => slack.postMessage(channel, text),
})
```

A `wire` credential resolves per user, so an unconnected user hits
`MissingCredentialError` rather than silently acting as someone else; a
`singleton` credential is platform-level and identical for every caller.

## Key Rule

**Never use `process.env` inside Pikku functions.** Use the `variables` or `secrets` service:

```typescript
// ❌ Wrong
const apiKey = process.env.API_KEY

// ✅ Correct
const apiKey = services.variables.get('API_KEY')
```

`process.env` belongs only in server bootstrap code (`start.ts`). Under `pikku dev` / `pikku serve` there is no `start.ts` — startup work goes in a `pikkuServerLifecycle` export, and the hooks receive the singleton services, so read configuration through `variables` there too (see pikku-services).

### Lint rules

`pikku.config.json` can set the severity of individual checks:

```json
{
  "lint": {
    "servicesNotDestructured": "error",
    "wiresNotDestructured": "error",
    "functionDynamicImport": "warn",
    "customServerBootstrap": "warn"
  }
}
```

`customServerBootstrap` is the one evaluated by `pikku workspace validate` rather than codegen: it warns when the root `start`/`dev` script boots a server without `pikku dev` / `pikku serve` and no runtime adapter is installed. Set it to `"off"` to keep a hand-rolled entrypoint, or `"error"` to enforce the hooks.

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
  func: async ({ variables }) => {
    const appConfig = await variables.getVariableJSON('APP_CONFIG')
    return {
      appName: appConfig.appName,
      maintenanceMode: appConfig.maintenanceMode,
    }
  },
})
```
