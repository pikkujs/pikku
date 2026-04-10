---
'@pikku/deploy-cloudflare': patch
'@pikku/core': patch
---

Add Workers for Platforms dispatch namespace support and AI agent fixes.

- deploy-cloudflare: Thread dispatchNamespace through deploy pipeline, reads CF_DISPATCH_NAMESPACE env var
- core: Fix auth-gated tools visible to unauthenticated sessions (null session now hides permission-gated items)
- core: Recursive null stripping in AI agent tool call resume path
- ai-vercel: Handle anyOf/oneOf/array types when making optional fields nullable for strict providers
