---
'@pikku/core': patch
'@pikku/cloudflare': patch
'@pikku/deploy-cloudflare': patch
---

Workflow steps now support per-step `retries` and `retryDelay` configuration. Cloudflare deployments gain Workflow Durable Object bindings for graph-DSL workflows on Workers-for-Platforms, and the deploy bundle now boots cleanly on the Cloudflare Workers runtime.
