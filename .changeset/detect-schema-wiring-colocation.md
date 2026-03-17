---
"@pikku/inspector": patch
---

Add critical error (PKU490) when Zod schemas and wiring calls (wireHTTPRoutes, addPermission, addHTTPMiddleware) coexist in the same file. The CLI uses tsImport to extract Zod schemas at runtime, which executes all top-level code — wiring side-effects crash in this context because pikku state metadata doesn't exist. Schemas and wirings must be in separate files.
