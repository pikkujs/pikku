---
'@pikku/console': patch
---

Tag the users and audit screens so a scenario can tell them apart from a screen that never mounted

Every other console screen carries something a test can wait for — a data
table, an empty state, a board. These two carried nothing in any state, so a
scenario could not distinguish "the audit trail is quiet" from "the audit screen
failed to render", and both had to be skipped. `admin-users` and `audit-page` sit
on the page root, which is the only thing nameable before it is known whether
there is any data to show.
