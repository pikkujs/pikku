---
'@pikku/core': patch
'@pikku/cli': patch
---

A webhook source can declare how its requests are signed, and the runner checks every request before `receive` runs:

```ts
wireTriggerWebhookSource({
  name: 'github',
  credential: 'githubWebhookSecret',
  verify: { hmac: { header: 'x-hub-signature-256', prefix: 'sha256=', algorithm: 'sha256', encoding: 'hex' } },
  receive: githubWebhookReceive,
})
```

`verify` is an HMAC over the raw body, a shared token or a public-key signature in one header, or a function `(request, secret, services) => boolean` for anything else. A request is refused while the credential is unset or when the signature does not match. A request without a body reaches `receive` unchecked so handshakes still work, but it may only be answered: events from it are refused.

`@pikku/core/hmac` gains `hmacDigest`, `verifyHmacSignature` and `verifyPublicKeySignature`. `WebhookSigningSecret` is deprecated.
