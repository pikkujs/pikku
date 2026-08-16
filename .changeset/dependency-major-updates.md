---
'@pikku/addon-console': patch
'@pikku/ai-deepinfra': patch
'@pikku/ai-vercel': patch
'@pikku/assistant-ui': patch
'@pikku/aws-services': patch
'@pikku/browser': patch
'@pikku/cli': patch
'@pikku/cloudflare': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/express': patch
'@pikku/express-middleware': patch
'@pikku/fastify-plugin': patch
'@pikku/gateway-slack': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/next': patch
'@pikku/paraglide': patch
'@pikku/queue-bullmq': patch
'@pikku/redis': patch
'@pikku/schedule': patch
'@pikku/uws-handler': patch
'@pikku/ws': patch
'create-pikku': patch
---

Bump every dependency whose latest release is a major across the monorepo, and
port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
store client in `@pikku/assistant-ui`.
