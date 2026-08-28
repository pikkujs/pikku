---
'@pikku/cli': patch
---

`pikku fabric validate` now fails a project whose generated `coercion.gen.ts` declares coercions that no Kysely instance applies, and the generated file itself says what has to consume it. An unwired coercion map cannot fail locally and 500s on the first deployed request.
