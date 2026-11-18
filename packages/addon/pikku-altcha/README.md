# @pikku/addon-altcha

A self-hosted [ALTCHA](https://altcha.org) proof-of-work captcha for public forms, as ordinary namespaced RPCs. No third-party service: the open-source core only, MIT.

- `captcha:getChallenge` issues a signed challenge that expires in five minutes.
- `captcha:verifyChallenge` checks a solved payload and records it, so a reused or expired one is refused.

It ships one table, `captcha_used_challenge`, declared in `db/tables.ts`. Your `pikku db generate` creates it.

```bash
npm install @pikku/addon-altcha
```

```ts
wireAddon({
  name: 'captcha',
  package: '@pikku/addon-altcha',
  expose: ['getChallenge'],
})
```

Set the secrets `ALTCHA_HMAC_SECRET` and `ALTCHA_HMAC_KEY_SECRET`. The package's `skills/using-altcha` explains the browser and server sides.
