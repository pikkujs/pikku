---
"@pikku/core": patch
---

Fix `HTTPRouteConfig` and `HTTPRoutesGroupConfig`'s default `PikkuPermission`/`PikkuMiddleware` type parameters under-specifying their own generic arguments (e.g. `CorePikkuPermission<any>` instead of `CorePikkuPermission<any, any, any>`). The missing arguments silently fell back to `CorePikkuPermission`'s own defaults (`CoreServices`, with `schema` optional) instead of `any`, so a project whose generated services type guarantees `schema` is always present (any project using `WiredServices`-style non-optional services) failed to type-check against `defineHTTPRoutes`/`wireHTTPRoutes` with a misleading `index signature` error.
