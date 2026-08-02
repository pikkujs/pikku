# @pikku/openapi-parser

## 0.12.17

### Patch Changes

- a7b26c5: rename the inspected declarations to `define*`: `wireScope` → `defineScope`, `wireSecret` → `defineSecret`, `wireVariable` → `defineVariable`, `wireCredential` → `defineCredential`

  `wire*` meant two unrelated things. A transport wiring attaches a function to
  something that can invoke it — `wireHTTP`, `wireChannel`, `wireScheduler`,
  `wireQueueWorker` and the rest — and the thing it wires runs. These four wire
  nothing: they are no-ops that exist only so the call typechecks, they are
  tree-shaken out of the build, and their whole job is to be found by the
  inspector's AST pass and turned into a type union. One word for both left the
  declaration reading like a registration with a runtime.

  So the vocabulary splits: **`wire*` is a transport, `define*` is an inspected
  declaration.**

  ```ts
  import { defineScope } from '@pikku/core/scope'
  import { defineSecret } from '@pikku/core/secret'
  import { defineVariable } from '@pikku/core/variable'
  import { defineCredential } from '@pikku/core/credential'

  defineScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })
  ```

  **Breaking:** no alias is kept. Rename the four call sites; the module subpaths
  (`@pikku/core/scope`, `/secret`, `/variable`) are unchanged.

  The inspector matches these by identifier text, so a stale `wire*` call is not a
  type error — it is silently not extracted, and the generated union comes back
  empty. That fails as "this scope isn't declared" on code that was fine a moment
  ago, nowhere near the declaration. Grep for the old names rather than trusting a
  clean build.

  An addon published with `.pikku` output generated before this release re-exports
  `wireSecret` from `@pikku/core/secret` and will not typecheck against this core
  until it is rebuilt and republished.

## 0.12.16

### Patch Changes

- 9f0d0eb: Migrate the `--oauth` addon scaffold off `OAuth2Client`. A scaffolded OAuth2
  addon service used to construct `new OAuth2Client(config, appCredentialSecretId,
secrets)` and do its own token exchange/refresh — the responsibility better-auth
  now owns via the credential service. The `pikku new addon --oauth` scaffold (and
  the OpenAPI `--openapi` generator) now emit a service that receives a ready
  access token: `services.ts` uses `createWireServices` + `wire.getCredential<{
accessToken: string }>(name)` and the service does a plain `fetch` with
  `Authorization: Bearer ${accessToken}`, matching the existing per-user
  bearer/apikey credential scaffold. With no remaining consumers, `OAuth2Client`
  (`@pikku/core/oauth2`) and its test are removed; the `./oauth2` export keeps the
  `OAuth2AppCredential` / `OAuth2Token` types.
- 8601505: Make `wireCredential` the single source of truth for an addon's OAuth2 config: `pikku-credentials.gen.ts` exports `CREDENTIAL_OAUTH2_CONFIGS`, generated services import from it, the OpenAPI importer emits a `wireCredential`, and the inspector now extracts `oauth2.additionalParams`.

## 0.12.15

### Patch Changes

- 854c342: Fix workspace addon integration: exclude nested pikku projects from inspection (prevents "More than one CoreUserSession/CoreConfig found" when a workspace addon is linked), widen the generated addon service `call()` data param to `unknown` so schema-less function inputs compile, and add `@pikku/inspector` + `@standard-schema/spec` to the generated addon devDependencies so its `.pikku` gen files typecheck.

## 0.12.14

### Patch Changes

- a10e88d: auth-config: new `extraHeaders` field — static headers baked into every generated request (the delegated login call and all proxied service calls), for upstreams that route on a header such as multi-tenant APIs resolving the tenant from `Origin`.

## 0.12.13

### Patch Changes

- 0f3edd3: Support an operator-supplied auth config that overrides/augments a spec's securitySchemes: custom auth header name/format (e.g. a raw token in `authentication:` instead of `Authorization: Bearer`), and a delegated-login descriptor (login path, credential fields, token dot-path, claims mapping from the decoded JWT payload or response body) that emits a self-contained `src/<name>-upstream-auth.ts` `authenticate<Name>Upstream()` for wiring into `@pikku/better-auth`'s `delegatedAuth()` plugin.

## 0.12.12

### Patch Changes

- d97f2a1: Always emit a description for generated addon functions (and their MCP tools). When an OpenAPI operation omits both `description` and `summary` (common), the generator now synthesizes one — a humanized `operationId` (with the `Controller` segment stripped), else `METHOD /path` — instead of emitting none. This removes the "MCP tool is missing a description" warnings and makes `--mcp`-exposed tools usable.

## 0.12.11

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.10

### Patch Changes

- 02fca80: Fix OpenAPI-to-addon codegen robustness across 2521 real-world specs (77% → 97.8% pass rate).
  - Cycle detection and depth limits in schema generation to prevent stack overflows
  - Schema partitioning: shared types file for multi-referenced schemas, inline for single-use (fixes crash on large specs)
  - Topological sort with z.lazy() for circular schema references
  - Validate default value types and enum membership before emitting .default()
  - Skip refinements (.min/.max) on incompatible Zod types
  - Sanitize reserved words and digit-leading names in function/type identifiers
  - Deduplicate schema names, imports, and object properties
  - 117 unit tests covering all edge cases

## 0.12.9

### Patch Changes

- 2ce0733: Fix credential services template variable passing, duplicate body/path param collision, and add credentialOverrides to wireAddon.

## 0.12.8

### Patch Changes

- 94ceecd: Fix duplicate property error in generated code when body and path/query/header params share the same name. Skips the body property with a warning.

## 0.12.7

### Patch Changes

- 5dd1996: Fix credentials command crash when state.credentials is undefined, and add --credential flag to `pikku new addon` for per-user credential wiring (apikey, bearer, oauth2).

## 0.12.6

### Patch Changes

- a57ff11: Add Swagger 2.0 support: extract requestBody from body parameters, responseSchema from direct response schema, and component schemas from definitions. Fix duplicate .describe() on request body properties.

## 0.12.5

### Patch Changes

- 8552e18: Don't generate `output: z.void()` for operations without response schemas — omit the field instead

## 0.12.4

### Patch Changes

- e3142ad: Use JSON.stringify for safe interpolation of OpenAPI spec values in generated code to prevent code injection via malicious specs.
