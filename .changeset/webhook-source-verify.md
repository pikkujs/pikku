---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

A webhook source can declare how its requests are signed, and the runner checks every request before `receive` runs:

```ts
wireTriggerWebhookSource({
  name: 'github',
  verify: { hmac: { header: 'x-hub-signature-256', prefix: 'sha256=', algorithm: 'sha256', encoding: 'hex' } },
  receive: githubWebhookReceive,
})
```

`verify` is an HMAC over the raw body, a shared token or a public-key signature in one header, or a function `(request, secret, services) => boolean` for anything else. A request is refused while the secret is unset or when the signature does not match. A request without a body reaches `receive` unchecked so handshakes still work, but it may only be answered: events from it are refused.

Declaring `verify` declares the secret's credential too, so it needs no `defineCredential`. It is a singleton string named `<source>WebhookSecret` in camelCase (`microsoft-outlook` → `microsoftOutlookWebhookSecret`, see `webhookSecretCredentialName`), or whatever `credential` names, described by `credentialDescription`.

`@pikku/core/hmac` gains `hmacDigest`, `verifyHmacSignature` and `verifyPublicKeySignature`. `WebhookSigningSecret` is deprecated.
