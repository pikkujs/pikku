---
'@pikku/cli': patch
---

`pikku validate` now reports an error when the project has a database (a `db/<engine>` folder or a database in `createConfig`) but the pikku config has no top-level `db`. Before, validate and `pikku all` passed and the deploy build failed later, when it added the platform contributors. Set `"db": { "engine": "sqlite" }` (or `postgres`, `mysql`) in `pikku.config.json`.
