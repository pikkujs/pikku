---
'@pikku/skills': patch
---

Audit the remaining skills against the shipped APIs and correct the drift.

- pikku-mcp: there is no `wireMCPTool` — a tool *is* the function (`mcp: true` or `pikkuMCPToolFunc`), while `uri`/`title`/`name` belong on `wireMCPResource`/`wireMCPPrompt` rather than on the `pikkuMCP*Func` factories; resources return `{ uri, text }` only; `PikkuMCPServer` takes `(config, logger)`
- pikku-http: `channel` is on the wire, not services; `sse` is `get`-only and `query` is `post`-only; `docs` was never a `wireHTTP` option; factories come from `#pikku`
- pikku-security: documents `authBearer`'s static-token mode, `authCookie`'s merged defaults and re-issue rule, and that every strategy is a no-op without an HTTP request or with a session already set
- pikku-better-auth: the `admin:users:*` scope tree gained create/ban/remove/sessions/password, and `syncProjectedAdminRole` projects them onto `user.role` for better-auth's own `admin()` endpoints; documents dev quick login
- pikku-react / pikku-react-query / pikku-workflows-client: `createPikku` options are flat `CorePikkuFetchOptions` with `authHeaders` and the `setAuthorizationJWT`/`setAPIKey`/`setHeader` setters (no request interceptor); `useWorkflowStatus` never stops polling on its own
- pikku-trigger: a source function runs once at startup with singleton services only; documents `InMemoryTriggerService` startup and the skipped-metadata warning
- pikku-schedule: the singleton is `schedulerService` and `start()` is what registers the cron jobs; documents `scheduleRPC` and the one-off task API
- pikku-ws: there is no `PikkuWSServer` — `pikkuWebsocketHandler({ server, wss, logger })` over a `noServer: true` `WebSocketServer` is the real API
- pikku-info: there are only four subcommands, and `--silent` works despite the spurious "Unknown option" warning
- pikku-versioning: `override` is not required — a matching `V<n>` export suffix is stripped automatically — and the live function must be bumped explicitly; `versions init` writes an empty manifest, so `versions update` has to follow it
- pikku-audit: documents `audit: { durability }`, the `Safe<>` guard on `auditLog.write`, `createInvocationAudit`'s logger argument, and `createAuditedKysely`'s options
- pikku-kysely: six packages, not four — `@pikku/kysely-node-sqlite` / `-bun-sqlite` build the instance functions query, while `createSQLiteKysely` is typed to `KyselyPikkuDB` and wires `SerializePlugin`; the secret service config is `{ key, keyVersion, previousKey, audit }`, not `{ kekSecret, salt }`, and `getSecret` returns a `SecretValue`
- pikku-emails: template variables are always optional and never required-able; unresolved placeholders render blank rather than failing; documents `pikku emails init`
- pikku-rtl: rewritten off i18next — there is no `t()` or `i18n.changeLanguage` anywhere in the repo; Arabic is a `messages/ar.json` listed in `project.inlang/settings.json`
- pikku-i18n: enum labels use the singular `enum__<group>__<member>` namespace `@pikku/paraglide` generates from, not hand-written `enums__` maps; notes the console's wrapped `m`/`mKey` as the one documented exception
- pikku-deps: the summary has `totalIssues`/`totalUpdates` and no `info` bucket, issue `url`/`cvssScore`/`recommendedVersion` are nullable rather than optional, lockfile detection covers pnpm and npm too, and a non-zero `bun audit` exit only counts as data when it produced output
- pikku-feature: stage changed files by path — `git add -A` sweeps up regenerated artifacts and, on a shared checkout, another agent's work
- pikku-jose: `decode` verifies the signature and expiry (it is not an unchecked read), keys resolve by the token's `kid` rather than being tried in turn, and the algorithm is fixed HS256
- pikku-machine-auth: documents restricting a key below its owner via `scopes` on the mapped session, the deliberate verify-vs-scope failure split, and that `betterAuthStatelessSession` has no api-key path
