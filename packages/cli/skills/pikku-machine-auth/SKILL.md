---
name: pikku-machine-auth
description: >-
  Use when authenticating a CLI/agent/service against a Pikku server, adding machine-to-machine
  (M2M) auth, issuing scoped API keys for sandboxes/agents/workers, or wiring better-auth sessions
  into Pikku middleware. Covers `pikku login` (device-authorization), the better-auth API Key
  plugin, machine identities, and `betterAuthSession` with the api-key branch. TRIGGER when: user
  asks about CLI login, `pikku login`, machine agents, service-to-service auth, API keys, client
  credentials, sandbox/worker tokens, or resolving a better-auth session in a Pikku function. DO
  NOT TRIGGER when: user asks about end-user HTTP session/cookie auth only (use pikku-http + the
  app betterAuth config) or about WebSocket channel mechanics (use pikku-websocket).
---

# Pikku Machine Auth

Unified authentication for humans **and** machines against a Pikku + better-auth
server. Two paths, two headers, one resolver:

| Caller                               | Credential                | Header                          | Obtained by                                           |
| ------------------------------------ | ------------------------- | ------------------------------- | ----------------------------------------------------- |
| **Human** (CLI, dev)                 | better-auth session token | `Authorization: Bearer <token>` | `pikku login` (device flow) → `~/.pikku/session.json` |
| **Machine** (agent, sandbox, worker) | scoped API key            | `x-api-key: <key>`              | `createApiKey` (server-side, at provision/spawn)      |

Both resolve to a Pikku `UserSession` through one middleware:
`betterAuthSession({ mapSession, apiKey: { mapKey } })`.

> The literal OAuth `client_credentials` grant is **not** implemented in
> better-auth's oidc-provider. The API Key plugin gives the same capability (a
> baked secret a service presents for scoped access), not the wire protocol.

## Agent Operating Procedure

1. Discover before editing — inspect the app's `betterAuth({ plugins: [...] })`
   config and existing middleware wiring before adding anything.
2. Server changes go in the auth factory + a middleware wiring file; never put
   auth checks in a function body (use `permissions`).
3. The API Key plugin contributes an `apikey` table — add the matching SQL
   migration and regenerate DB types before relying on it.
4. Validate with the narrowest command, then `pikku all`.

## Human path — `pikku login`

```bash
pikku login --url https://app.example.com   # device-authorization flow
pikku whoami                                  # show current session + expiry
pikku logout                                  # remove stored session
```

`pikku login` runs the RFC 8628 device flow: it requests a code, opens the
browser to the verification URL, polls until you approve, then stores the
session token (keyed by base URL) at `~/.pikku/session.json` with its expiry.

**Server requirement** — enable the `deviceAuthorization` and `bearer` plugins:

```typescript
import { deviceAuthorization, bearer } from 'better-auth/plugins'

betterAuth({
  // ...
  plugins: [
    deviceAuthorization({ expiresIn: '5min', interval: '5s', schema: {} }),
    bearer(), // lets `Authorization: Bearer <session-token>` resolve a session
  ],
})
```

The browser approval is two steps the user's browser does automatically:
`GET /auth/device?user_code=XXXX` (claims the code while signed in) then
`POST /auth/device/approve`. The CLI only requests the code and polls
`POST /auth/device/token`.

## Machine path — API keys

Install the plugin (separate official package) and enable it:

```bash
yarn add @better-auth/api-key   # peer: better-auth ^1.6.19
```

```typescript
import { apiKey } from '@better-auth/api-key'

betterAuth({
  plugins: [
    apiKey({
      enableMetadata: true, // REQUIRED to store scope on the key
      enableSessionForAPIKeys: true, // lets a key resolve via getSession too
    }),
  ],
})
```

### Identity model

A **machine is an API key, not a throwaway user.** Keys are owned by a small set
of stable **service-user** identities you provision once (e.g. `orchestrator`,
`machine-agent`, `builder`, `sandbox-runtime`). Per-machine scope rides on the
key's `metadata`/`permissions`. A key requires a real owning user row — minting
one for a non-existent `userId` is created but will not resolve.

### Mint a scoped key (server-side, at spawn/provision)

```typescript
// `auth` is the better-auth instance (injected service)
const { key } = await auth.api.createApiKey({
  body: {
    userId: sandboxRuntimeUserId, // a stable service user
    name: `sandbox:${sandboxId}`,
    expiresIn: 60 * 60, // seconds
    metadata: { sandboxId }, // keep only STABLE ids here
    permissions: { sandbox: ['read', 'write'] },
  },
})
// inject `key` into the machine's env; it sends it as `x-api-key`.
```

Rotate by minting a new key and expiring/deleting the old (`deleteApiKey`);
multiple active keys per identity allow zero-downtime rotation.

### Resolve scope — `verifyApiKey`, not `getSession`

`getSession(x-api-key)` returns only a bare mock session **without** the
metadata. Scope must come from `verifyApiKey`, which returns
`{ valid, key: { userId, metadata, permissions } }`. The
`betterAuthSession` api-key branch does this for you:

```typescript
import { betterAuthSession } from '@pikku/better-auth'
import { addHTTPMiddleware } from '@pikku/core/http'

addHTTPMiddleware([
  betterAuthSession({
    // human path: getSession result -> app session
    mapSession: ({ user }) => ({ userId: user.id }),
    // machine path: verified key -> app session. `services` lets you resolve
    // CURRENT scope (e.g. look up the owning row) instead of trusting only the
    // baked metadata.
    apiKey: {
      header: 'x-api-key', // default
      mapKey: async (key, services) => {
        const sandboxId = key.metadata?.sandboxId
        if (!sandboxId) return null // reject
        const row = await services.kysely
          .selectFrom('sandboxInstance')
          .innerJoin('sandbox', 'sandbox.id', 'sandboxInstance.sandboxId')
          .select(['sandbox.orgId', 'sandbox.projectId'])
          .where('sandboxInstance.sandboxId', '=', sandboxId)
          .where('sandboxInstance.stoppedAt', 'is', null)
          .executeTakeFirst()
        if (!row) return null
        return { userId: sandboxId, orgId: row.orgId, role: 'sandbox' }
      },
    },
  }),
])
```

When the api-key header is present it is authoritative — the middleware never
falls through to `getSession` (a bare mock session would shadow the scoped one).
When it is absent, the human `getSession` path runs as normal.

### WebSocket channels authenticate on the upgrade handshake

Generated channel CLI clients attach the credential as a connection header
(`x-api-key` for `PIKKU_API_KEY`, else `Authorization: Bearer` from
`~/.pikku/session.json`). The `@pikku/ws` server copies the upgrade-request
headers into the channel's `http.request` and runs the inherited HTTP `*`
middleware during `runUpgradeMiddleware`, so `betterAuthSession` resolves the
session before the channel opens. For this to work the app must register
`betterAuthSession` via `addHTTPMiddleware([...])` (the `*` group) — not only on
specific routes — so it is inherited into the channel upgrade. Browser clients
cannot set WebSocket headers, so header-auth only covers the Node CLI path; a
browser channel needs a query-param/subprotocol vector instead.

## Gotchas

- `apiKey()` rejects `metadata` unless `enableMetadata: true`.
- `deviceAuthorization()` requires a `schema` option (pass `schema: {}`).
- Keep the two paths on **different headers** — `x-api-key` (machine) vs
  `Authorization: Bearer` (human). One header for both reintroduces ambiguity.
- The `apikey` table is plugin-contributed — add the SQL migration + regen types.
- `~/.pikku/session.json` is written `0600` and stores the token + expiry; the
  CLI uses the expiry to detect when a re-login is needed.
