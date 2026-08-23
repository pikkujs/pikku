---
'@pikku/skills': patch
---

`pikku-info` becomes `pikku-meta`, and now owns the whole metadata surface rather
than the four `pikku info` tables.

Fifty-one skills already open with "Discover before editing. Run the relevant
`pikku meta ... --json`", and no skill documented that command — the one that did
exist covered a different, smaller command and was named after it. It also carried
no `installGroups`, so `pikku skills install --core` never installed it and agents
never saw it at all.

It now covers reading (`context`, `functions`, `schemas`, `workflows`, `wires`,
`permissions`, `middleware`, `clients`), changing (`pikku meta apply` — the batch
contract, which properties each kind accepts, and why one `pikku all` at the end
beats one per property), and keeps the `pikku info` tables as the human-readable
view. `installGroups: [core]` means it ships.
