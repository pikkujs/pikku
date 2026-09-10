---
'@pikku/skills': patch
---

`pikku-knowledge` now says that a milestone which has reached `built` is closed: neither its note nor its plan is edited again. The rule was implied by everything around it and written down nowhere, so an agent tidying a finished milestone was doing something the skill never told it not to.

The reasoning is in the skill: `progress` fails when what shipped contradicts the plan, which is not a check at all if the losing side may be rewritten, and `attempts:` brakes a note nothing can satisfy by watching its content change. Both only hold while a finished plan stays still. What to do instead — a new milestone, a reconciliation, or a decision note that supersedes it — is spelled out per case, along with the one exception, the `statusAt:` / `attempts:` bookkeeping the loop owns at any status.
