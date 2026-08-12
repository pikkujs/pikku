---
'@pikku/addon-console': patch
'@pikku/console': patch
---

Show what the scorers declared and what they graded: a `/scorers` page listing
every declared scorer with its lane, sampling rate and the agents that named it,
and a Runs tab in the agent inspector listing the open conversation's runs with
the grades each one earned.

`console:getAgentThreadRuns` now answers under the same ownership as the thread
itself — a caller without the admin scope sees only its own runs, filtered
rather than refused, so the answer never confirms someone else's thread exists.
