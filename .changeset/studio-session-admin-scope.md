---
'@pikku/cli': patch
---

Studio's session now holds `admin`, so Studio's admin pages (accounts, permissions, switches, connections, incoming alerts, audit) can call pikku-admin instead of failing with MissingScopeError.
