---
"@pikku/cli": patch
"@pikku/openapi-parser": patch
---

Fix credentials command crash when state.credentials is undefined, and add --credential flag to `pikku new addon` for per-user credential wiring (apikey, bearer, oauth2).
