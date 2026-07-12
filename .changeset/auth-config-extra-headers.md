---
'@pikku/openapi-parser': patch
---

auth-config: new `extraHeaders` field — static headers baked into every generated request (the delegated login call and all proxied service calls), for upstreams that route on a header such as multi-tenant APIs resolving the tenant from `Origin`.
