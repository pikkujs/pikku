---
'@pikku/cli': patch
'@pikku/knowledge': patch
'@pikku/skills': patch
'@pikku/addon-console': patch
'@pikku/core': patch
---

Changes and changesets replace milestones. The changes commands run on a local queue when the checkout has no fabric project; `pikku changes next` routes to a changes, upgrade or knowledge agent and merges finished changesets. A changeset that creates or alters a table, or is large, needs a plan at `knowledge/plans/<changeset>.plan.json` (anything else goes to an optional judge at `PIKKU_PLAN_JUDGE_URL`), and `changes done` holds it to that plan. `pikku knowledge gaps` replaces `knowledge next`/`reconcile`, and also reports code a merged plan built that is gone and notes that were deleted.
