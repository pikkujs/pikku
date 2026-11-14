---
'@pikku/core': patch
'@pikku/addon-admin': patch
'@pikku/addon-console': patch
---

`WiringService` and the `AllMeta` types now live in `@pikku/core` (MIT), exported as `@pikku/core/services/wiring-service`, so Studio and the controlplane can share them. `@pikku/addon-console` re-exports them (including `@pikku/addon-console/services`), so existing imports keep working. `@pikku/addon-admin` gains `agentCredentialCheck` under `admin:credentials:read`, reading the agent from running state; the console copy is deprecated. See docs/MIGRATION.md.
