---
'@pikku/inspector': patch
'@pikku/core': patch
'@pikku/cli': patch
---

fix(core,inspector): let a host grant an addon secrets it could not declare

Scoping an addon's `SecretService` to its `declaredSecrets` left generic addons
with nothing readable: `declaredSecrets` is derived from the addon package's own
source, but the secrets an addon like `@pikku/addon-graph` reads are named by the
consuming app's workflow nodes at runtime. Every authenticated `graph:httpRequest`
threw.

`wireAddon` now takes `secretGrants: string[]` and `credentialGrants: string[]`,
completing the grant family alongside `secretOverrides` (grant + rename) and
`globalSecrets` (grant everything, with a reason). Grants name the secret as the
addon reads it, since the scope check runs before the override map renames it —
which is also why an override's key grants and its value does not.

A grant naming a secret the project does not declare is an `INVALID_VALUE`
critical at codegen, resolved through the override map before lookup.
