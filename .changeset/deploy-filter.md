---
'@pikku/inspector': patch
'@pikku/cli': patch
---

feat(cli): `pikku all --deploy serverless|server` filter

Adds a deploy-target dimension to `InspectorFilters` so a single `pikku all`
invocation can emit a target-scoped set of gen files (bootstrap, services,
meta, RPC client, fetch client, websocket, realtime, queue, workflow, MCP).
Useful for runtime templates (e.g. cloudflare-workers) that need to exclude
server-only functions from their bundle to avoid pulling in node:fs and
other Node-only modules.

A function's effective deploy target is determined by:

1. If any of its services is listed in `deploy.serverlessIncompatible`
   (read from `pikku.config.json`), target is `'server'`.
   - If the function also explicitly declares `deploy: 'serverless'`,
     the codegen throws `IncompatibleDeployTargetError` so the
     mismatch surfaces at build time.
2. Otherwise the explicit `deploy: 'serverless' | 'server'` field
   on the function config wins.
3. Default `'serverless'`.

Example — mark `metaService` as server-only project-wide:

```jsonc
// pikku.config.json
{
  "deploy": {
    "serverlessIncompatible": ["metaService"]
  }
}
```

Then a CF runtime template's package.json can do:

```json
"pikku": "pikku all --deploy serverless"
```

…and every gen file will exclude functions that consume `metaService`
(e.g. the pikku-console addon's functions), eliminating the node:fs
import from the worker bundle.

The same `resolveDeployTarget` util now backs both the per-unit deploy
analyzer and the inspector filter, so behavior stays consistent.
