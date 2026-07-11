---
'@pikku/core': patch
---

Two webhook-gateway fixes found in the first real (WhatsApp Cloud API) integration:

- `reloadGeneratedMeta` now merges HTTP wirings meta per method instead of replacing it. Webhook gateways (`wireGateway`) register their POST/GET route meta at runtime — never in the generated JSON — so the dev-server's wholesale replace dropped them and every gateway request 500'd with "Cannot read properties of undefined (reading 'headersSchemaName')". Generated entries still win per route, matching the function/queue meta merge behaviour.
- The webhook GET verify route now returns the challenge as a raw body (`returnsJSON: false`): platforms compare the echo byte-for-byte against the challenge they sent, and the previous JSON serialization (`"CHALLENGE"` with quotes) failed e.g. Meta's verification. Failed verification now throws `UnauthorizedError` (401) instead of returning 200 with an error object.
