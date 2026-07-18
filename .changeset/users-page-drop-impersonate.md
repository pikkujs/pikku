---
'@pikku/console': patch
---

Remove the per-row impersonate action from the admin Users page. Impersonation
is driven from the header (the impersonate control in the navbar), so the Users
table no longer renders its own impersonate/stop buttons.
