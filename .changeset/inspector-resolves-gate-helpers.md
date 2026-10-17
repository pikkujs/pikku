---
'@pikku/inspector': patch
---

The inspector now recognises middleware, permission, auth and function helpers by what the callee resolves to, not by its spelling (#1461). `import { addTagMiddleware as guard }`, `import * as pikku from '#pikku'`, a re-export under another name and `const guard = addTagMiddleware` all register their middleware, permissions and `pikkuBetterAuth` definition, where before they registered nothing and the gate silently never ran. The same applies to `pikkuMiddleware`, `pikkuMiddlewareFactory`, `addGlobalMiddleware`, `addHTTPMiddleware`, the channel and agent middleware helpers, `pikkuPermission`, `pikkuAuth`, `pikkuPermissionFactory` and `betterAuth` (so the `admin()` refusal still applies under an alias).

An aliased `pikkuFunc` now requires a session. Previously `sessionless` was derived from the spelling, so `pikkuFunc as pikkuOpenFunc` produced a function the runtime ran without one.

A middleware or permission helper used as a value — passed as an argument, put in an array or object, returned from a ternary — is reported as the new `PKU577` (`REGISTRATION_NOT_A_DIRECT_CALL`, severity `error`), because what it registers is invisible to codegen.
