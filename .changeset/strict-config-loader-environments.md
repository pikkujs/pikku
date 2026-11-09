---
'@pikku/cli': patch
---

The `pikku.config.json` loader refuses every key that is not in `PikkuCLIInput`, at the top level and inside each section, naming the new home of a key that moved. `outDir` is no longer a key (output is always `.pikku/` beside the config), and `dev`, `entrypoint`, `showcase`, `fabric`, `node`, `addons` and stray CLI flags are refused. `environments` now names backends and frontends (`{ "local": { "backends": { "api": "http://localhost:4000" }, "frontends": { "web": "…" } } }`); the auth paths sit on the backend entry, a local backend URL can be derived from `backends.<name>.dev.port`, and `pikku scenario run`, `pikku virtual-user run`/`rpc` and `pikku pages screenshot` take `--backend`. Breaking changes are in docs/MIGRATION.md.
