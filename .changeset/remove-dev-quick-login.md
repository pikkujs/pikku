---
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Remove dev quick login. The `${basePath}/dev/quick-login` route, the `PIKKU_DEV_QUICK_LOGIN` flag that `pikku dev` and `pikku serve` set by default, and the `admin@pikku.dev` account it created are gone, and `createAuthHandler` now forwards every request to better-auth. Nothing in this repository called the route. Sign in through your normal sign-in, or `virtualUser()` under `pikku dev`. An `admin@pikku.dev` user already in a dev database is left as it is.
