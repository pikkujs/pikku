---
"@pikku/openapi-parser": patch
---

Fix OpenAPI-to-addon codegen robustness across 2521 real-world specs (77% → 97.8% pass rate).

- Cycle detection and depth limits in schema generation to prevent stack overflows
- Schema partitioning: shared types file for multi-referenced schemas, inline for single-use (fixes crash on large specs)
- Topological sort with z.lazy() for circular schema references
- Validate default value types and enum membership before emitting .default()
- Skip refinements (.min/.max) on incompatible Zod types
- Sanitize reserved words and digit-leading names in function/type identifiers
- Deduplicate schema names, imports, and object properties
- 117 unit tests covering all edge cases
