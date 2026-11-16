---
'@pikku/core': patch
'@pikku/addon-admin': patch
---

`WiringService`, `readAllMeta` and the `AllMeta` types now live in `@pikku/core` (MIT), exported as `@pikku/core/services/wiring-service`, so Studio and the controlplane can share them. `@pikku/addon-admin` gains `agentCredentialCheck` under `admin:credentials:read`, reading the agent from running state, and the console's `agentCredentialCheck` is removed. See docs/MIGRATION.md.
