---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

A list function's generated input schema now comes from the real `ListInput<F, S>`. `filter` is the recursive `Filter<F>` through `$ref`, `sort.column` is an enum of the declared sort columns, and the fields of F are no longer merged into the top level. `pikku-inspect` also reports `PKU492` (error) when a generated input or output schema contains `unknown` or `never` that the source did not declare. `LeafFilter` no longer admits `undefined` for optional fields.
