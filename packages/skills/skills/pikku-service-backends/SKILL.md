---
name: pikku-service-backends
description: >-
  Use when picking or wiring a backend for one of Pikku's core service interfaces — ContentService
  (S3, Backblaze B2), QueueService (SQS), SecretService (AWS Secrets Manager, Redis, MongoDB),
  SchemaService (AJV, cfworker), ChannelStore, EventHubStore, WorkflowService, SessionStore or
  AgentRunService (Redis, MongoDB). Covers which backend to choose, what each one silently does
  differently, and the failures they swallow. TRIGGER when: code uses S3Content, B2Content,
  SQSQueueService, AWSSecrets, RedisChannelStore, RedisSecretService, MongoDBChannelStore,
  PikkuMongoDB, AjvSchemaService or CFWorkerSchemaService, or the user asks how to store files,
  secrets, channel state or sessions. DO NOT TRIGGER when: defining service factories themselves
  (use pikku-services), SQL via Kysely (use pikku-kysely), or the Lambda/Cloudflare runtimes
  themselves (use pikku-deploy).
installGroups: [core]
---

# Pikku Service Backends

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Constructor shapes and method signatures come from `pikku doc` — run
`pikku doc --ai` for the installed surface. This skill is the part the compiler
cannot tell you: which backend implements which interface, and what changes when
you swap one for another.

`pikku-services` covers how to build and wire a service. This covers what to put
behind the interface.

## Pick a backend

| Interface | Backends | Package |
| --- | --- | --- |
| `ContentService` | `S3Content`, `B2Content` | `@pikku/aws-services`, `@pikku/backblaze` |
| `QueueService` | `SQSQueueService` | `@pikku/aws-services` |
| `SecretService` | `AWSSecrets`, `RedisSecretService`, `MongoDBSecretService` | `@pikku/aws-services`, `@pikku/redis`, `@pikku/mongodb` |
| `SchemaService` | `AjvSchemaService`, `CFWorkerSchemaService` | `@pikku/schema-ajv`, `@pikku/schema-cfworker` |
| `ChannelStore`, `EventHubStore` | Redis, MongoDB | `@pikku/redis`, `@pikku/mongodb` |
| `PikkuWorkflowService`, `WorkflowRunService` | Redis, MongoDB | `@pikku/redis`, `@pikku/mongodb` |
| `SessionStore`, `AgentRunService`, `DeploymentService` | Redis, MongoDB | `@pikku/redis`, `@pikku/mongodb` |
| `AgentStorageService`, `AgentRunStateService` | MongoDB **only** | `@pikku/mongodb` |

SQL is the third option for every store interface in that table —
`KyselyChannelStore`, `KyselyWorkflowService`, `KyselySecretService` and friends
live in `@pikku/kysely` and are covered by `pikku-kysely`, because using them
means writing queries.

Per-package detail: `references/aws.md`, `references/backblaze.md`,
`references/redis.md`, `references/mongodb.md`, `references/schema.md`.

## What changes when you swap a backend

### Redis and MongoDB are not interchangeable, in two ways

They cover almost the same interface list, but:

- **MongoDB has AI conversation storage and Redis does not.**
  `MongoDBAgentStorageService` is the only implementation of
  `AgentStorageService`/`AgentRunStateService`. A Redis-only deployment cannot
  persist agent conversations.
- **Every MongoDB service needs `await init()`; no Redis service does.** `init()`
  is what creates the collections and indexes. Constructing a
  `MongoDBChannelStore` and using it without awaiting `init()` compiles and then
  behaves like an unindexed collection — slow first, wrong later.

Redis services take the connection directly (an ioredis `Redis`, `RedisOptions`,
or a URL string). MongoDB services take a `Db`, which means a `PikkuMongoDB`
wrapper has to be constructed and initialised before any of them.

### The two content backends share a design and a trap

`S3Content` and `B2Content` are close enough to swap, and both:

- treat `bucket` on every call as a **logical** bucket stored as a path prefix
  (`${bucket}/${key}`) inside the one real bucket the config names. Do not
  provision a bucket per logical bucket — the config takes exactly one.
- **ignore `visibility` on `getUploadURL`**.
- **swallow write failures**: `writeFile`, `copyFile` and `deleteFile` log and
  return `false` rather than throwing, while the read paths throw. An ignored
  return value is a silently lost file.

Where they diverge:

| | `S3Content` | `B2Content` |
| --- | --- | --- |
| Signing failure | **Fails open** — logs and returns the *unsigned* URL | Throws |
| `writeFile` memory | Streams | **Buffers the whole stream** to compute a SHA-1 |
| Client-side upload integrity | Presigned, expires at a fixed 3600s | `X-Bz-Content-Sha1: do_not_verify` — unverified |
| Credential rotation | Picked up by the SDK provider chain | Auth is cached for the instance's lifetime — construct a new `B2Content` |

The S3 fail-open is the one to design around: on a private CloudFront
distribution the client gets a 403, and on a public one you have just handed out
an unrestricted link. Validate `signConfig` at boot rather than trusting a throw.

### Secret backends differ on whether the app can write

- **`AWSSecrets` is read-only.** `setSecret` and `deleteSecret` throw. Secrets
  are managed out of band; the app only reads them.
- **Redis and MongoDB do envelope encryption** and can write, delete, and
  `rotateKEK()`. Rotation requires `previousKey` to have been set — a service
  constructed without it cannot rotate later without a redeploy.
- **Only MongoDB has audit hooks** (`audit`, `auditReads`).

`AWSSecrets` also collapses every failure — missing, denied, binary-only — into
the same `FATAL: Error finding secret: <id>`, with the real reason on the error's
`cause`. Read `cause` before concluding a secret is absent; `hasSecret` returns
`false` for any error and cannot distinguish the two either.

### AJV and cfworker are not drop-in equivalents

Swapping them changes behaviour without changing types:

- **`useDefaults`**: AJV fills schema defaults into the validated object in
  place. cfworker does not, so a field you relied on being defaulted arrives
  `undefined` on Workers.
- **Recompilation**: AJV caches by name for the process lifetime — a second
  `compileSchema` with the same name is a no-op. cfworker replaces the validator
  when the schema value changes, which is what lets a dev hot-reload pick up
  regenerated schemas. On AJV, restart the process instead.
- **Coercion is neither one's job.** `coerceTypes` is off; a query-string `"1"`
  becomes `1` in the wiring layer, not here.

Both throw `UnprocessableContentError` (422) on a failed validation, and both
throw a **bare string** — `Missing validator for <name>` — for a *missing*
schema. It is not an `Error`, so `catch (e) { e.message }` reads `undefined`.
That almost always means codegen did not run.

Use cfworker on Cloudflare Workers: AJV compiles with `new Function`, which the
Workers runtime forbids.

### SQS gives you no result back

`SQSQueueService` sets `supportsResults = false` and `getJob()` always throws —
the transport is fire-and-forget. So is the Azure Storage Queue backend. Reach
for BullMQ or PgBoss (see `pikku-queue`) when a caller needs the job's result.

## What NOT to do

- Do not ignore the boolean from `writeFile`, `copyFile` or `deleteFile`. Both
  content backends report failure that way and neither throws.
- Do not rely on `S3Content.signURL` throwing. It fails open and hands back an
  unsigned URL.
- Do not construct a MongoDB-backed service without awaiting `init()`.
- Do not assume AJV and cfworker validate identically — `useDefaults` alone
  changes what your function receives.
- Do not provision one real bucket per logical bucket; the prefix is the bucket.
- Do not reach for SQS when a caller needs the result of the job.
