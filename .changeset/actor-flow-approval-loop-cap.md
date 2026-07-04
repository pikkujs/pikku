---
'@pikku/core': patch
---

Bound the actor-flow approval loop (#850)

`converseWithTarget` now caps suspend→approve rounds within a single target turn
(default 16, override via `maxApprovalRounds`). A cooperative target completes
after a handful of rounds; a buggy or uncooperative one — e.g. re-requesting a
tool the persona keeps denying — previously could spin the inner loop forever
without ever spending a `maxTurns` credit. Exceeding the cap now throws instead
of hanging.
