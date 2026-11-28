---
'@pikku/core': patch
---

`setDefaultHostResolver` is no longer exported from `@pikku/core/safe-fetch`. Any dependency could call it with `undefined` and turn the SSRF guard back into literal-IP checks for every `safeFetch` in the process. `installNodeHostResolver` from `@pikku/core/node-host-resolver` is the one way to install a resolver.
