---
'@pikku/express-middleware': patch
'@pikku/fastify-plugin': patch
'@pikku/uws-handler': patch
---

Native HTTP adapters bypassing Fetch API conversion. Express, Fastify, and uWS now use native request/response objects directly instead of converting to/from the Fetch API `Request`/`Response`, eliminating unnecessary serialization overhead on every request.
