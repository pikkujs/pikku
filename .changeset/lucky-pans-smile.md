---
'@pikku/console': patch
---

Make every console screen nameable by a test

Two gaps, same shape. `AdminUsersPage` and `AuditPage` carried no data-testid in
any state, so a scenario could not tell "the audit trail is quiet" from "the
audit screen failed to render"; `admin-users` and `audit-page` now sit on their
page roots, which is the only thing nameable before it is known whether there is
any data.

And a screen whose search is built in the header's `filters` slot got no testid,
while one that passes the `search` prop has carried `page-search` all along —
the same control, nameable on some screens and not others depending on how the
header was assembled. Eight pages now agree with the rest.
