---
type: decision
title: A first-party tracking cookie is written only after its purposes are consented
description: mintCookie writes a new cookie only when every purpose it requires is true in the consent record, and writes nothing on a wire with no HTTP response
tags: core, analytics, consent, cookies
---

# A first-party tracking cookie is written only after its purposes are consented

`packages/core/src/analytics/mint-cookie.ts` creates a first-party cookie when
none exists. The doc comment says writing the cookie "IS the act consent governs",
so a minter that runs before the banner is answered has already done what the
send gate was meant to prevent (`mint-cookie.ts:11-15`).

The consent check is `permitted`. It returns true when no purposes are required,
and otherwise requires each purpose to be exactly `true` in the consent record
(`mint-cookie.ts:29-35`). A purpose missing from the record counts as refused.
`mintCookie` runs that check after it has found no existing cookie and no cached
value (`mint-cookie.ts:72`).

An existing cookie is returned before the consent check (`mint-cookie.ts:63-64`).
Reading a cookie the visitor already holds is therefore not gated by consent. The
`overwrite` option is the only way to replace it (`mint-cookie.ts:19-26`).

A wire with no HTTP response returns `undefined` and writes nothing
(`mint-cookie.ts:70-71`), as the doc comment says for cron tasks and queue workers
(`mint-cookie.ts:50-53`).

The value is cached per wire, so a second call in one request returns the same
identity (`mint-cookie.ts:66-68`, `77`, and the comment at `mint-cookie.ts:46-48`).

**What this rules out:** writing a tracking cookie before its purposes are
consented, and minting an identity on a non-HTTP wire.
