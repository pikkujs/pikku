---
'@pikku/cli': patch
---

Fix Better Auth schema introspection during `pikku db migrate` by using
`LocalVariablesService` and `LocalSecretService` for the non-runtime auth
factory context instead of a handwritten stub with the wrong variables
interface shape.
