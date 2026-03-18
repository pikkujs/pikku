---
"@pikku/inspector": patch
"@pikku/cli": patch
---

Optimize CLI codegen performance: 12x faster `pikku all`

- Reuse schemas across re-inspections (skip redundant `ts-json-schema-generator` runs)
- Cache TS schemas to disk (`.pikku/schema-cache.json`) for cross-run reuse
- Pass `oldProgram` to `ts.createProgram` for incremental TS compilation
- Cache parsed tsconfig in schema generator between runs
- Auto-include direct `addPermission`/`addHTTPMiddleware` in bootstrap via side-effect imports
- Skip `pikkuAuth()` errors when nested inside `addPermission`/`addHTTPPermission`
