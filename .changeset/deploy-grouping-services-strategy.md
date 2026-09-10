---
'@pikku/cli': patch
'@pikku/deploy': patch
---

Add `deploy.grouping.strategy: 'services'` — one deployment unit per distinct
set of singleton services.

One unit per function is a lot of units, and `'single'` is the only alternative,
which is too coarse: it puts the AI SDKs in with everything. `'services'` keys a
function on the singleton services its body destructures, minus the ones every
unit builds regardless, and names the unit for that set (`svc-todo-store`,
`svc-base`). On `templates/functions` it turns 44 units into 10.

The deploy target is part of the key, so a `server` unit is named `-server` and
never merges with its serverless twin — a function can declare `deploy: 'server'`
itself while carrying exactly the services a serverless one does, and keying on
services alone made that plan fail the mixed-target refusal.

Units named this way record their key as `servicesKey` in the deployment
manifest. The existing `services` list is keyed by capability and cannot tell
`workflowService` from `workflowRunService`.
