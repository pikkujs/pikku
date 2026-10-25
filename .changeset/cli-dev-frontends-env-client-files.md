---
'@pikku/cli': patch
---

`pikku dev` now runs every frontend that sets `dev.command`, not just the API. Each starts in its own directory beside the server, its output is prefixed with its name, `--frontend a,b` picks some and `--no-frontends` runs the API alone, and if any process dies everything stops and the command exits non-zero. The root `.env` is parsed once and passed to the API and every frontend (a frontend's own `.env` overrides it for that child, and nothing already set is replaced), and `BETTER_AUTH_SECRET` plus any secret declared with `generate` is appended to `.env` on the first run, with a message naming each required secret that cannot be generated.

`pikku all` can also generate the frontend client files from `clientFiles`: `typesFile` (`RPCInput`, `RPCOutput`, `AnalyticsEvent`), `envFile` (`apiUrl`, `basePath`, `appHref`), `rpcFile` (an isomorphic `rpc()` client for route guards) and `authClientFile` (the Better Auth client glue). `clientAuth` sets where that glue sends people.
