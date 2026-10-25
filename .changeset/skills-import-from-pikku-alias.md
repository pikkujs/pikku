---
'@pikku/skills': patch
---

The middleware examples import `cors`, `authBearer`, `pikkuChannelMiddleware` and `addGlobalMiddleware` from `#pikku/middleware` instead of `@pikku/core/middleware`: app code reaches Pikku through the generated alias, and `pikku validate` reports the other form as an error.
