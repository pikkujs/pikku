---
name: using-altcha
description: >-
  Protect a public Pikku form with the ALTCHA proof-of-work captcha addon: wire it, fetch a challenge in the browser, post the solved payload, and verify it in the form's function before the database write.
---

# Using `@pikku/addon-altcha`

A self-hosted captcha with no third-party service. The server issues a signed, single-use challenge; the browser widget solves a small proof-of-work; the form posts the solution; the server verifies it and spends it.

## Wire it

```ts
import { wireAddon } from '#pikku/pikku-types.gen.js'

wireAddon({
  name: 'captcha',
  package: '@pikku/addon-altcha',
  expose: ['getChallenge'],
})
```

- Name it `captcha`. Its table is `captcha_used_challenge`, and every addon table must start with the wired name.
- Only `getChallenge` is exposed. `verifyChallenge` stays server-side so a browser cannot spend challenges.
- Set the secrets `ALTCHA_HMAC_SECRET` and `ALTCHA_HMAC_KEY_SECRET`, each 32 characters or more and different from each other. Rotating them invalidates challenges in flight, which is harmless.
- Optionally set `ALTCHA_COST` (default 5000, the PBKDF2 iterations per attempt). Raise it to slow bots further, lower it for slow devices.
- Run `pikku all`, then `pikku db generate` and `pikku db migrate`. The addon ships its table as a declaration and never creates it itself.

## Browser

```ts
import 'altcha'

const widget = document.querySelector('altcha-widget')
widget.configure({ challenge: await rpc.invoke('captcha:getChallenge') })
```

Give the widget the challenge object through `configure`, not a URL: the RPC is a POST and the widget's URL form issues a GET. The widget then writes the base64 payload into a hidden field named `altcha`; include that string in the form's input. At the default cost it solves in two to four seconds on a desktop browser, which is fine because the visitor started it, and it needs HTTPS (`localhost` counts). The bundle is about 120 KB minified.

A challenge expires after five minutes. When the widget fires `expired`, fetch and configure a new one.

## React and Tailwind

Copy two files from this skill's `references/` into the app, both tested in a real browser:

- `captcha-field.tsx`: `<CaptchaField getChallenge onChange resetKey />`. It keeps the ALTCHA widget hidden and shows its own Tailwind button with idle, checking, verified, expired and error states. It reports the payload through `onChange` (`null` whenever the payload is not usable) and fetches a fresh challenge when one expires.
- `contact-form.tsx`: a form that holds the payload in state, disables Send until it is set, sends it as `altcha`, maps the three refusal codes to messages, and bumps `resetKey` after every submit, because a payload is spent whether or not the submit worked.

Adapt two things: the `rpc` import in `contact-form.tsx` (any client that calls `captcha:getChallenge` and your form function works), and how the refusal code is read from your client's error (the example reads the start of `error.message`).

Install the widget with `npm install altcha`. Tailwind v4 needs the two files in its `@source` paths.

## Server

Call verify first in every public form function, before anything is written:

```ts
await rpc.invoke('captcha:verifyChallenge', { payload: data.altcha })
```

It throws on failure and returns `{ verified: true }` once the challenge is spent. Declare `altcha: z.string()` on the form's input so a missing one fails validation too.

| Refusal           | Meaning                                         |
| ----------------- | ----------------------------------------------- |
| `CAPTCHA_INVALID` | missing, unreadable, tampered or wrongly solved |
| `CAPTCHA_EXPIRED` | solved after its five minutes                   |
| `CAPTCHA_REUSED`  | that solution was already submitted             |

All three answer 422. Show "please try again" and fetch a fresh challenge.

## Gotchas

- Verify in the function that does the write, not in a workflow step behind it: a retried step would see its own challenge as reused.
- Proof-of-work slows a bot down; it does not stop one. Keep rate limiting and input validation in place.
- Verify runs `deriveKey` from `altcha-lib/algorithms/pbkdf2`, which imports `node:crypto`. It runs on Node, Bun and Node-compatible serverless; a pure edge runtime needs a WebCrypto `deriveKey`.
