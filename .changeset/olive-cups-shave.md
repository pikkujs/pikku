---
'@pikku/cli': patch
---

Remove generated schema files that are no longer required

`saveSchemas` rewrites `register.gen.ts` from scratch on every run, so a schema that
is no longer required stops being registered — but its `<Name>.schema.json` stayed on
disk indefinitely. That orphan is not inert: it is the artifact tooling reads to answer
"what does the server validate against?", and it answers with the shape the function had
at some earlier point. Anything trusting it concludes the schema is correct while the
running server disagrees, which presents as an unfixable "stale server" that no
regeneration or restart resolves.

The schemas directory is now kept in step with `register.gen.ts`: if a schema is not
imported there, its file is deleted.
