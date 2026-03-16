---
"@pikku/core": patch
---

Fix toWebRequest to respect x-forwarded-proto and x-forwarded-host headers behind reverse proxies. Previously always used http:// which broke OAuth callback URLs behind TLS-terminating proxies like Fly.io.
