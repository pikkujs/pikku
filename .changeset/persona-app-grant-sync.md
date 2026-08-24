---
'@pikku/better-auth': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Provision the app a persona signs into as a grant, not just a declaration.

`CorePersona.app` decided where a browser run navigated and nothing else, so
"which frontend may this person reach" was a fact only the test runner held and
the deployment could not enforce. It is now a scope: the CLI derives an `app`
tree from the apps the personas name, and `provisionPersonas` grants
`app:<name>` alongside the roles.

Carried as a scope rather than a per-app column so it resolves at the session
boundary like every other grant — revocable at runtime from the console, not
inherited by a restricted API key, and one query for which apps a user may
reach instead of a migration per frontend. A single-frontend product declares
nothing and is unaffected.

`app` is reserved as a scope root: a `defineScope` call that also declares it
now fails the build rather than shadowing the derived tree.
