---
'@pikku/core': patch
---

`WebhookSigningSecret` in `@pikku/core/hmac`: holds a provider's webhook signing secret in a singleton service and checks HMAC, shared-token and public-key signatures for a `receive` step, refusing everything when the secret was never provisioned.
