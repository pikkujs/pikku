---
'@pikku/cli': patch
---

Gate the generated console secret and variable brokers behind admin scope.

The console scaffold emits `pikkuConsoleGetSecret`, `pikkuConsoleSetSecret`,
`pikkuConsoleHasSecret` and the two variable brokers as exposed `pikkuFunc`s with
no scope. `wireAddon({ scopes: ['admin'] })` only governs functions whose
`packageName` is the addon, and these are emitted into the app's own scaffold —
so the addon gate never reached them, and any authenticated user could read and
overwrite every application secret through `POST /rpc/:rpcName`.

Each broker now declares `scopes: ['admin']` itself, enforced per-call in the
function runner.

CWE-862.
