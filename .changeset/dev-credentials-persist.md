---
'@pikku/cli': patch
'@pikku/inspector': patch
---

`pikku dev` keeps stored credentials in the dev database, so connected accounts and delegated sign-ins survive a restart. The key comes from `PIKKU_DEV_CREDENTIALS_KEY`, or is generated once into `.pikku-runtime/dev-credentials.key`. A project that declares a credential now gets the credential tables in its generated migration; without them dev falls back to the in-memory store and says so once.
