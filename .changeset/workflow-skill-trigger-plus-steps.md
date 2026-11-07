---
'@pikku/skills': patch
---

The `pikku-workflow` skill now says anything started by a trigger (a schedule, an event, a webhook, a form submit that kicks off background work) is a workflow, even with a single step. The trigger starts it and the work is its steps. On-screen request/response functions stay plain functions, and a workflow is never moved to a queue worker without the owner deciding. This replaces the old "one durable step is a queue worker" rule.
