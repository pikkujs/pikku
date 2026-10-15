---
type: decision
title: Consent is read from a cookie, and a recognised denial value counts as a refusal
description: cookieAnalyticsIdentity grants a consent purpose only when its cookie is present and not one of a fixed set of denial values, and resolves no identity off a non-HTTP wire
tags: core, analytics, consent, cookies
---

# Consent is read from a cookie, and a recognised denial value counts as a refusal

`packages/core/src/analytics/cookie-analytics-identity.ts` reads consent and
vendor identifiers from first-party cookies. The doc comment says a purpose is
true "only when the cookie is present and is not a recognised denial", so a
consent tool that writes a refusal rather than deleting the cookie is read as a
refusal (`cookie-analytics-identity.ts:7-11`).

The denial values are `0`, `false`, `denied`, `deny` and `no`
(`cookie-analytics-identity.ts:15`). The comparison is case-insensitive
(`cookie-analytics-identity.ts:49`).

A purpose whose cookie is absent is left out of the consent record entirely
(`cookie-analytics-identity.ts:47-48`). Since `mintCookie` requires `=== true`
(`mint-cookie.ts:34`), an absent cookie is a refusal there.

A wire with no HTTP request resolves nothing (`cookie-analytics-identity.ts:34-35`).
The doc comment says a cron task or queue worker has no browser, so "any vendor
id they produced would be invented" (`cookie-analytics-identity.ts:24-25`).

**What this rules out:** treating any present cookie value as consent, and
inventing a vendor identity for a non-browser caller.
