---
'@pikku/skills': patch
---

Fix `pikku-knowledge` teaching a section and a status that nothing reads.

The skill described the work-note section as `slices/` with `type: slice`.
`@pikku/knowledge` has no such concept: `MILESTONES_DIR` is
`knowledge/milestones`, `MILESTONE_TYPE` is the literal `'milestone'`, and
`readMilestones` filters on both. A note written the way the skill described
is invisible to `pikku knowledge next`, to the milestone gate and to
reconcile — the knowledge base looks empty rather than wrong, which is the
expensive way to fail. The type-table row also claimed `validate` accepts
both spellings; it does not.

It also documented `status: designing` as the step before `proposed`.
`MILESTONE_STATUSES` is `['proposed', 'dispatched', 'built']`, so that note
fails `validate`. The paragraph now says a profile may add a status of its
own ahead of `proposed` and that validating it is the profile's job, which
is what a downstream base actually does.
