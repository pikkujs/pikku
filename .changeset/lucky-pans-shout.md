---
'@pikku/knowledge': patch
---

Add the pieces a loop needs to drive seats over a knowledge base.

The **attempt ledger** — `attemptsSpent`, `recordNoteAttempt`, `noteAttempts`,
`noteFingerprint` — bounds how many turns one seat may spend on one note, and
refunds the budget when the note is rewritten. Keyed on a fingerprint of the
body plus the scalars a gate can refuse on, so a repair that lands on
frontmatter counts. `attempts:` is now read as an OKF scalar.

The **milestone lifecycle** — `setMilestoneStatus` (stamps `statusAt:`),
`nominatedMilestone`, `dispatchedMilestone`, `markDispatchedMilestoneBuilt`,
`holdMilestoneLifecycle` — plus the Gherkin lints `firstPersonStep` and
`quotedIn`, and `setNoteScalars` as the single frontmatter writer.

`MILESTONE_STATUSES` moves from `validate.ts` to `milestone.ts`; it is still
re-exported from both, so the public surface is unchanged.
