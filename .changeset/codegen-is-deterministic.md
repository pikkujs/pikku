---
'@pikku/inspector': patch
---

Generated type aliases are deterministic

A type name that collided across files got a `Math.random()` suffix, so every
`pikku all` emitted different names into `pikku-agent-map.gen.d.ts` and
`pikku-workflow-map.gen.d.ts`. Those files sit in the schema generator's
dependency closure, so rewriting them invalidated the schema cache partway
through the same run and forced a full `ts-json-schema-generator` pass each
time. The suffix now comes from the declaring file's path.
