---
type: decision
title: Core's SSRF guard matches host literals because edge runtimes have no DNS
description: safeFetch rejects internal address literals and re-validates every redirect hop; it cannot stop DNS rebinding
tags: core
---

# Core's SSRF guard matches host literals because edge runtimes have no DNS

`packages/core/src/utils/safe-fetch.ts` guards every outbound fetch that core
makes on a caller-supplied URL. `@pikku/core` runs in edge runtimes (Cloudflare
Workers) that have no Node `dns` module, so the guard cannot resolve a hostname
and inspect the resulting address. It instead rejects address _literals_ that are
obviously internal — loopback, `10/8`, `172.16/12`, `192.168/16`, `0.0.0.0/8`,
link-local `169.254/16` (the cloud metadata endpoint), IPv6 `::`, `::1`,
`fe80::/10` and `fc00::/7` — plus the alias forms that reach the same targets:
trailing-dot FQDNs, the reserved `*.localhost` names, IPv4-mapped IPv6, and the
`inet_aton`-style octal/hex/32-bit-integer encodings that `fetch` and `undici`
accept (`0177.0.0.1`, `0x7f000001`, `2130706433`).

Literal matching alone is not enough, because the classic bypass is a public URL
that 302s to `169.254.169.254`. So `safeFetch` sets `redirect: 'manual'` and
re-validates every hop through `assertFetchableUrl` before following it, follows
only the statuses in `REDIRECT_STATUSES` (301/302/303/307/308 — `300`, `304`,
`305` and `306` are returned to the caller as-is), applies the WHATWG
method/body transform per hop, cancels each intermediate response body, and
strips `Authorization` and `Cookie` whenever a hop crosses origin. What it
deliberately does **not** cover is DNS rebinding: a public hostname that itself
resolves to a private IP passes, because catching that needs resolution the
runtime does not offer.

**What this rules out:** "simplifying" `isPrivateHost` down to a `localhost` /
`127.0.0.1` string check — the octal, hex, integer and IPv4-mapped-IPv6 branches
are each a live bypass, not defensive noise. It equally rules out replacing the
manual redirect loop with `redirect: 'follow'` to shorten the function: the
platform would then follow a `Location` into the internal network with no
validation and no credential stripping, which is the entire attack this file
exists to block. Do not add DNS-based checks either without gating them —
importing `node:dns` breaks the Workers build.
