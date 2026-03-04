---
"@pikku/core": patch
"@pikku/express-middleware": patch
"@pikku/fastify-plugin": patch
"@pikku/uws-handler": patch
"@pikku/next": patch
---

Add Web Response passthrough support and fix close() flushing

- HTTP runner detects when a function returns a Web `Response` object and applies it directly via `applyWebResponse()`, enabling seamless integration with libraries like Auth.js
- Add `send()` method to `PikkuHTTPResponse` for setting body without Content-Type headers
- Add `headers()` method to `PikkuHTTPRequest` for retrieving all headers as a record
- Add `toWebRequest()` and `applyWebResponse()` utilities for Web Request/Response conversion
- Fix `close()` in Express, Fastify, and UWS responses to flush buffered status/headers/body before ending the connection
