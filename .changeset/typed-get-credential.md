---
'@pikku/core': patch
'@pikku/cli': patch
---

`wire.getCredential('name')` is typed by the project's own credentials, and is always on the wire. Function types were written from the setup-only inspection, which never sees `defineCredential`, so every project fell back to an untyped map; `pikku all` now rewrites them once the credentials leaf exists. `getCredential` and `getCredentials` are no longer optional on `PikkuWire`, since the function runner always sets them. Without a credentials map, `getCredential<string>('name')` returns `string` rather than `unknown`.
