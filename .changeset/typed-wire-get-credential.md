---
'@pikku/core': patch
'@pikku/cli': patch
---

fix: type `wire.getCredential` from the generated `CredentialsMap`

`wire.getCredential('slack')` now resolves its value type from the project's
credentials codegen, the way `services.credentials.get('slack')` already did.
`PikkuWire` takes a `TypedCredentials` parameter and the generated function
types bind `CredentialsMap` into it; a name the map does not know stays callable
with an explicit type argument.
