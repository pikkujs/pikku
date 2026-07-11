---
'@pikku/core': patch
'@pikku/inspector': patch
---

Webhook gateway routes are now fully compiled instead of runtime-registered. The inspector projects `wireGateway` into the generated HTTP and function meta (deterministic `gateway__<name>__post`/`__verify` ids), and the gateway runner no longer mutates meta state at runtime — it only registers the handler implementations at module load, like every other wire. Previously the runtime-only meta was invisible to codegen and the dev-server meta reload wiped it, 500ing every gateway request.

Also fixes the GET verification echo: string challenges return as a raw body (platforms compare byte-for-byte; the old JSON quoting failed Meta's check), object responses stay JSON, and failed verification now throws `UnauthorizedError` (401) instead of returning 200 with an error body.
