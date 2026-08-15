---
'@pikku/core': patch
'@pikku/addon-console': patch
'@pikku/addon-graph': patch
'@pikku/ai-deepinfra': patch
'@pikku/ai-vercel': patch
'@pikku/aws-services': patch
'@pikku/backblaze': patch
'@pikku/better-auth': patch
'@pikku/jose': patch
'@pikku/kysely': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
'@pikku/mongodb': patch
'@pikku/pino': patch
'@pikku/queue-bullmq': patch
'@pikku/queue-pg-boss': patch
'@pikku/redis': patch
'@pikku/schema-ajv': patch
'@pikku/schema-cfworker': patch
---

Services and addons reach core only through `@pikku/core/ecosystem/*`

The same move the runtime adapters just made, applied to the other two packages
that extend Pikku rather than build on it. 239 specifiers across 98 files now
point at a facade instead of a raw subpath.

What a service or an addon needs turns out to be mostly *contracts*: the
interfaces an implementation satisfies, plus the argument and result shapes
their methods name. `@pikku/kysely` cannot implement `SessionStore` without
being able to say `SessionStore`, so these are ecosystem surface by
construction.

A contract goes to the facade for its **domain**, not to a bucket named after
the fact that it happens to live in `services/`: `ScopeService` to
`ecosystem/scope`, `Role` to `ecosystem/role`, `SchemaService` to
`ecosystem/schema`, `CredentialService` to `ecosystem/credential`,
`VariablesService` to `ecosystem/variable`, `SecretService`/`SecretValues`/
`assertSecretAllowedForHost` to `ecosystem/secret`, `SchedulerService` to
`ecosystem/scheduler`, `QueueWebhookService` to `ecosystem/queue`, and the six
agent run/runner/storage names to `ecosystem/agent`. `ecosystem/services` keeps
only what has no domain of its own — `ContentService` and its argument types,
`SessionStore`, `AuditLog`/`AuditService`, alongside the `JWTService` and
`MetaService` already there.

`Role` moving out is a correction to what was there before this change, not
just to what it added.

The loose names follow the same rule: `hasScopes`/`verifyScopes` to
`ecosystem/scope`, `pikkuMiddleware` to `ecosystem/middleware`,
`SecretValue`/`isSecretValue`/`getRelativeTimeOffsetFromNow`/`CoreServices` to
`ecosystem/types`, the four agent thread types to `ecosystem/agent`,
`AgentRunScore` to `ecosystem/agent-scorer`.

Three deployment services in `@pikku/lambda`, `@pikku/azure-functions` and
`@pikku/cloudflare` took `SecretService` from `ecosystem/services` and now take
it from `ecosystem/secret`; those packages are already bumped by the sibling
runtime changeset.

`ecosystem/crypto-utils` is new — envelope encryption had no twin at all, and
`@pikku/kysely` and `@pikku/better-auth` both wrap credentials with it.

The guard test in core now covers all three ecosystem trees, and parses rather
than greps: `code-edit.service.test.ts` keeps user function sources in template
literals, and the `import … from '@pikku/core'` inside one of those is fixture
text, not an import this package makes.
