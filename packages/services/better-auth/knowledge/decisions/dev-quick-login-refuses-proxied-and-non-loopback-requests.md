---
type: decision
title: Dev quick login refuses proxied and non-loopback requests
description: The fixed dev admin sign-in is judged by the raw Host header and refused whenever a proxy-forwarding header is present, and it is never on in production whatever the flag says
tags: better-auth, dev, quick-login, security
---

# Dev quick login refuses proxied and non-loopback requests

`/dev/quick-login` (`dev-quick-login.ts`, served from `createAuthHandler`) signs
in a fixed admin account, `admin@pikku.dev`, with a password in the source. It
grants that account the `admin` and `pikku:console` scope roots. Because of that,
the file has four gates:

1. **Flag.** `PIKKU_DEV_QUICK_LOGIN` must be `true` or `1`.
2. **Production refuses.** `NODE_ENV === 'production'` disables it regardless of
   the flag. The comment says `pikku serve` and `pikku dev` default the flag on, so a
   deploy that inherits that environment must not carry the account.
3. **No proxy markers.** If any of `forwarded`, `x-forwarded-for`, `x-forwarded-host`
   or `x-forwarded-proto` is present, the request is refused. The comment says this
   means it "was relayed and is not a direct local connection."
4. **Raw Host is loopback.** Locality comes from the `Host` header alone, never the
   forwarded one. Accepted names are `localhost`, `127.0.0.1`, `::1` and `[::1]`.

The reason for rule 4 is that `toWebRequest` lets `X-Forwarded-Host` override
`Host`, so a remote caller could otherwise pass as `localhost`.

**What this rules out:** trusting a forwarding header to establish locality,
enabling quick login in production, and any quick-login path that does not go
through these checks.

Whether quick login could become an impersonation step is an open question, recorded in
core under `questions/dev-quick-login-as-impersonation`.
