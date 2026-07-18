---
'@pikku/n8n-import': patch
---

Lower Set / Edit Fields nodes with computed fields to real functions. A Set node
whose assignments are all literals, pure refs, or templates still emits a
declarative `graph:editFields` call. But when any assignment is a value the
expression classifier can't lower (arithmetic, method chains, `new Date()`,
`$env`, …) the whole node is now emitted as a generated `pikkuSessionlessFunc`
that returns its computed field object — run through the same translation path
(and item/ref shim) as a Code node — instead of dropping the field to a
`// TODO(n8n expr)` comment. The node is only functionized when the synthesized
body would actually translate; a value reaching outside its input (`$vars`,
`$secrets`, a dynamic node ref) stays a declarative editFields node rather than
becoming a throwing stub. Across the corpus this cuts dropped n8n expressions
from 1382 to 223 (−1159) with no change to the clean/partial/failed counts.

Also drops the redundant `data as any` casts from the generated Code/Set
function bodies (the file is already `@ts-nocheck`; the typed contract lives at
the Zod input/output boundary).
