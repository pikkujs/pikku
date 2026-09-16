---
'@pikku/knowledge': patch
---

`checkAgainstMilestone` compares a milestone's entities and personas against the plan by word rather than by spelling, so `entities: repair job` matches a `repairJob` function or a `repair_jobs` table instead of refusing the plan over the separator
