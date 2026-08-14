---
'@pikku/console': patch
---

The nav dock's zones are now declared rather than inferred from section order.
A `NavSection` says which zone it belongs to with `zone: 'row' | 'group'`,
replacing the implicit "first section wins" rule that also left the untitled
Changes section as a loose tile among the group tiles.

The default nav is regrouped around what each screen is: eight surfaces you work
on sit on the row (Overview, Functions, Workflows, Agents, Scenarios, Database,
Emails, Knowledge) and the rest sit behind four named groups — AI, Wiring,
Project and Access. Overview had no nav entry at all before this and was
reachable only by URL or the `/` redirect.

The dock also gains an account tile, folding appearance, metadata refresh,
impersonation and **sign out** into one menu — sign out previously had no
trigger anywhere in the shell except the not-authorized screen, which a
signed-in user never sees.
