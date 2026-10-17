---
type: decision
title: Dev quick login refuses proxied and non-loopback requests
description: The dev admin sign-in uses a per-process random password, is judged by the raw Host and Origin headers, is refused whenever a proxy-forwarding header is present, and is never on in production whatever the flag says
tags: better-auth, dev, quick-login, security
---

# Dev quick login refuses proxied and non-loopback requests

`/dev/quick-login` (`dev-quick-login.ts`, served from `createAuthHandler`) signs
in a fixed admin account, `admin@pikku.dev`. It grants that account the `admin`
and `pikku:console` scope roots.

The account has no lasting password. Each process mints a random one, and quick
login rewrites the account's credential to it before every sign-in, so nothing
in the source (or an older dev database's fixed `pikku-dev-password`) can sign
into it through `/sign-in/email` afterwards. Because of the grants, the route
has five gates:

1. **Flag.** `PIKKU_DEV_QUICK_LOGIN` must be `true` or `1`.
2. **Production refuses.** `NODE_ENV === 'production'` disables it regardless of
   the flag. The comment says `pikku serve` and `pikku dev` default the flag on, so a
   deploy that inherits that environment must not carry the account.
3. **No proxy markers.** If any of `forwarded`, `x-forwarded-for`, `x-forwarded-host`
   or `x-forwarded-proto` is present, the request is refused. The comment says this
   means it "was relayed and is not a direct local connection."
4. **Raw Host is loopback.** Locality comes from the `Host` header alone, never the
   forwarded one. Accepted names are `localhost`, `127.0.0.1`, `::1` and `[::1]`.

5. **Not another site.** `Sec-Fetch-Site: cross-site` is refused, and an `Origin`,
   when present, must also be loopback (`null` is refused). A page elsewhere
   posting to `localhost` carries both.

The reason for rule 4 is that `toWebRequest` lets `X-Forwarded-Host` override
`Host`, so a remote caller could otherwise pass as `localhost`. Rules 4 and 5 are
still headers the client writes; no pikku request exposes the socket address, so
the bind address of `pikku serve`/`pikku dev` (127.0.0.1) is what actually keeps
a remote caller out. A custom runtime listening on 0.0.0.0 should leave
`PIKKU_DEV_QUICK_LOGIN` unset.

**What this rules out:** trusting a forwarding header to establish locality,
enabling quick login in production, and any quick-login path that does not go
through these checks.

Whether quick login could become an impersonation step is an open question, recorded in
core under `questions/dev-quick-login-as-impersonation`.
