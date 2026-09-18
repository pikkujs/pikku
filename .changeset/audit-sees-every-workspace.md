---
'@pikku/cli': patch
---

`pikku audit --outdated` sees every workspace, not just the root package

`bun outdated` reports only the package it is run from, so in a monorepo the
audit listed the root's dependencies and nothing from `apps/*` or `packages/*` —
on a five-workspace project that was 5 packages out of 23. It now runs with
`--filter '*'`, which also widens bun's table with a Workspace column, so the
parser reads the five-cell rows as well as the four-cell ones. Reading only the
four-cell shape would have returned no updates at all for those repos, and
advisories would have lost the `recommendedVersion` they take from that map.
