---
'@pikku/skills': patch
'@pikku/core': patch
---

Remove `WebhookSigningSecret` from `@pikku/core/hmac`: declare `verify` on `wireTriggerWebhookSource` instead, or use `hmacDigest`, `verifyHmacSignature`, `verifyPublicKeySignature` and `timingSafeStringEqual` directly. The trigger skill and the online-shop snippet now teach declarative `verify`, and the `verify` JSDoc describes bodiless requests correctly.
