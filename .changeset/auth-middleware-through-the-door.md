---
'@pikku/cli': patch
'@pikku/core': patch
---

authBearer, authCookie and authAPIKey now come from `#pikku/middleware`, so nothing needs `@pikku/core`
