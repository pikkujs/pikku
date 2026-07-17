---
'@pikku/console': patch
---

Stop rendering a suspended workflow run as a red error.

Core stores a suspended run with a synthetic `error` row carrying the suspend reason
(`code: 'WORKFLOW_SUSPENDED'` or `'RPC_NOT_FOUND'`). The run detail panel gated its red **Error**
card on error truthiness alone, never on status, so a healthy run merely waiting on a human was
presented as a failure.

- The error card now excludes suspend reasons; a suspended run gets its own card instead.
- `WORKFLOW_SUSPENDED` and `RPC_NOT_FOUND` get distinct copy — "waiting to be resumed" vs "deploy the
  missing function, then resume" are different operator actions.
- `statusDefs` gained a `suspended` entry (yellow, matching the canvas and timeline, which already
  coloured it that way). Previously it fell back to an unstyled gray badge.
- Flow cards showed no status badge at all for a suspended last run.
- The run list gained a Suspended filter.

An unrecognised `error.code` on a suspended run is still shown as a real error, so a genuine failure
can't hide behind a reassuring card.
