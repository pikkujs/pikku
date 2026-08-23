---
'@pikku/cli': patch
---

Honour `PIKKU_PERSONA_CREATE_MISSING=true` again.

`variables.get` JSON-parses its value, so the flag arrived as the boolean
`true` and never equalled the string it was compared against — every
deployed scenario run asked the stage not to create the persona, and
failed on the first one with `No account on this stage for ...`. The
operator token beside it survived the same parse only because a JWT is
not valid JSON.
