# @pikku/openapi-parser

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
