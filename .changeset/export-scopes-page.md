---
'@pikku/console': patch
---

Export `ScopesPage` so a host console can mount the roles and scopes screen, the way `AuditPage` and `SecurityPage` already can. The page was reachable only through the console's own router, which put runtime role and grant editing out of reach for anything embedding these pages.
