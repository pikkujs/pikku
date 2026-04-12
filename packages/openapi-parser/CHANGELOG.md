# @pikku/openapi-parser

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
