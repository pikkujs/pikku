---
'@pikku/cli': patch
---

feat: `pikku scopes audit` and `pikku scopes prune`

Scopes sync additively, so a scope removed from code leaves an inert row rather
than revoking a grant mid-deploy. These commands are the deliberate cleanup
path.

`pikku scopes audit` reports scopes in the database that are no longer declared
in code, along with the roles still holding them. `pikku scopes prune` removes
them, cascading them out of every role — but only with `--yes`; without it,
prune just shows the blast radius.
