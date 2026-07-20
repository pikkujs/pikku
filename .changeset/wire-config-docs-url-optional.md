---
'@pikku/inspector': patch
'@pikku/core': patch
---

Add `docsUrl` and `optional` to wireSecret / wireVariable / wireCredential

`docsUrl` links to documentation explaining how to obtain a value, so a console
or deploy UI facing a missing secret can point somewhere instead of showing a
bare identifier like `STRIPE_SECRET_KEY`.

`optional` marks a value the app can start without, letting deploy gates report
it as informational rather than blocking. Previously optionality could only be
expressed as prose inside `description`, which no gate can read — so a secret
the app deliberately treats as optional would still park a deploy.

Both are additive and default to absent; existing wirings are unaffected. The
fields are carried through the inspector and the definition validators, so they
reach the generated metadata rather than being dropped mid-pipeline.
