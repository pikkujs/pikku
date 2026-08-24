---
'@pikku/better-auth': patch
---

Export `delegatedAuth` from the package barrel, so `import { delegatedAuth } from '@pikku/better-auth'` resolves — only its types were re-exported, leaving the factory reachable from its own module alone. Refresh `PLUGIN_REGISTRY`: drop `admin`, which pikku refuses, and add the shipped-but-unlisted `ban` and `credentialOAuth`.
