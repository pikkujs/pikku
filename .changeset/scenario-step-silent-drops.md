---
'@pikku/inspector': patch
---

Fix two silent losses in scenario step extraction.

Destructuring a scenario step result (`const { threadId } = await scenario.given(...)`) dropped the
step from the graph without a diagnostic — the step stayed fully typed and present in the step map,
then failed at runtime with `Function not found`. It now reports PKU679, like every other step form
the DSL cannot model.

A constant referenced as step input (`{ resourceId: RESOURCE_ID }`) was serialized as
`{ $ref: 'trigger', path: 'RESOURCE_ID' }` — a read of a trigger field that does not exist. A `const`
with a literal initializer is now inlined as that literal.
