---
'@pikku/addon-admin': patch
'@pikku/addon-console': patch
---

`@pikku/addon-admin` gains `agentCredentialCheck` under `admin:credentials:read`, reading the agent from running state. `@pikku/addon-console` no longer has `agentCredentialCheck`; call `admin:agentCredentialCheck` instead. See docs/MIGRATION.md.
