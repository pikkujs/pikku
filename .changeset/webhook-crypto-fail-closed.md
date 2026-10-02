---
'@pikku/core': patch
'@pikku/gateway-slack': patch
---

Harden webhook signature verification. An empty or missing secret now fails closed at every call site (`verifyHmacSignature`, webhook source verification, `WebhookService.verify`, `verifySlackSignature`), including a signature computed over an empty key. HMAC verification now decodes the signature to bytes and compares with `crypto.subtle.verify('HMAC', ...)` instead of a pure-JS string compare, and a malformed hex signature is rejected. `verifyPublicKeySignature` accepts Ed25519 SPKI keys again.
