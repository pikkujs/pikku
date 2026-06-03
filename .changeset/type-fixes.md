---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

refactor(types): reconcile function-config drift between Core and schema variants

Schema-overload variants (`PikkuFunction{,Sessionless}ConfigWithSchema`)
now derive from `CorePikkuFunctionConfig` so future fields auto-propagate.
Doc comments clarified: `title` is the short human-readable name (e.g.
"Create Todo"); `description` is the longer-form explanation.
