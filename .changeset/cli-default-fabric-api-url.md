---
'@pikku/cli': patch
---

fix(cli): default Fabric API URL to production

The fabric CLI defaulted `DEFAULT_API_URL` to `http://localhost:7103`, so
`pikku fabric login` / `pikku fabric addon publish` hit a local backend
out of the box — producing confusing "Code not found" / 404 errors for
anyone not running fabric-api locally. Default to
`https://api.pikkufabric.com`; local dev opts in via `FABRIC_API_URL` or
`pikkufabric.config.json` (both rank above the default in the resolution
order, so nothing changes for core devs).
