# @pikku/deploy-cloudflare

## 0.0.2

### Patch Changes

- 9e8605f: Add Workers for Platforms dispatch namespace support and AI agent fixes.

  - deploy-cloudflare: Thread dispatchNamespace through deploy pipeline, reads CF_DISPATCH_NAMESPACE env var
  - core: Fix auth-gated tools visible to unauthenticated sessions (null session now hides permission-gated items)
  - core: Recursive null stripping in AI agent tool call resume path
  - ai-vercel: Handle anyOf/oneOf/array types when making optional fields nullable for strict providers

- 7ab3243: Add server-fallback deployment target for functions that can't run serverless.

  Functions can declare `deploy: 'serverless' | 'server' | 'auto'`. With `serverlessIncompatible` config, the analyzer auto-routes functions using incompatible services to a container.

  Server functions are merged into a single tree-shaken unit with a PikkuUWSServer entry, Dockerfile, and CF Container proxy Worker.

  Also adds sub-path exports to @pikku/cloudflare for tree-shaking (greet bundle 1.6MB → 444KB) and deploy verifiers for cloudflare, serverless, and azure providers.
