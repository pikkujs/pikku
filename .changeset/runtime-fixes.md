---
'@pikku/addon-graph': patch
'@pikku/node-http-server': patch
'@pikku/next': patch
'@pikku/deploy-standalone': patch
'@pikku/fetch': patch
---

Fix `@pikku/addon-graph` package exports so generated bootstrap files can be imported correctly. The Node.js HTTP server adapter is unified across dev, standalone, and container deployments. Next.js gains a worker-RPC transport. Date values in fetch responses now deserialise correctly.
