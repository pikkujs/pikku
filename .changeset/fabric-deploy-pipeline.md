---
"@pikku/core": patch
"@pikku/cli": patch
"@pikku/inspector": patch
"@pikku/addon-console": patch
"@pikku/cloudflare": patch
"@pikku/kysely": patch
---

Add deploy pipeline with provider-agnostic architecture

- Add MetaService with explicit typed API, absorb WiringService reads
- Add deployment service, traceId propagation, scoped logger
- Rewrite analyzer: one function = one worker, gateways dispatch via RPC
- Add Cloudflare deploy provider with plan/apply commands
- Add per-unit filtered codegen for deploy pipeline
- Skip missing metadata in wiring registration for deploy units
- Fix schema coercion crash when schema has no properties
- Fix E2E codegen: double-pass resolves cross-package Zod type imports
