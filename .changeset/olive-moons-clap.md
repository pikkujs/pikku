---
'@pikku/knowledge': patch
---

Add the milestone lifecycle and the Gherkin lints.

`setMilestoneStatus` is the one function that moves a milestone's state and the
one that dates it (`statusAt:`) — the note's mtime is not the transition time.
`holdMilestoneLifecycle` snapshots and restores that state across a turn that
rewrites notes, because re-filing the body is wanted and reverting `status:` is
how one milestone gets built twice. With them come `nominatedMilestone`,
`dispatchedMilestone`, `markDispatchedMilestoneBuilt`, `withoutMilestonesDir`
and `entitiesOf`.

`firstPersonStep` and `quotedIn` are the two lints that decide whether a
scenario can name an actor at all.

`MILESTONE_STATUSES` moves from `validate.ts` to `milestone.ts`; it is still
re-exported from both, so the public surface is unchanged.
