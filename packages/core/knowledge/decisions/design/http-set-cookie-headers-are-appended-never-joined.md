---
type: decision
title: Set-Cookie headers are appended individually, never joined
description: Every cookie gets its own header line, because Set-Cookie is the one header comma-joining corrupts
tags: http
---

# Set-Cookie headers are appended individually, never joined

`PikkuFetchHTTPResponse.toResponse` in
`packages/core/src/wirings/http/pikku-fetch-http-response.ts` serializes each
cookie separately and calls `headers.append('Set-Cookie', cookie)` per value
rather than setting one joined string. `collectSetCookieHeaders` in
`web-request.ts` mirrors this when copying a web `Response` back onto a
`PikkuHTTPResponse`: it prefers `Headers.getSetCookie()` where the runtime
provides it, falls back to scanning for the header by name, de-duplicates, and
passes the values through as an array.

RFC 6265 makes `Set-Cookie` the exception to the "fold repeated headers with
commas" rule — cookie attributes such as `Expires` contain commas themselves, so
a joined header is parsed as a single malformed cookie and every cookie after the
first is lost. `Headers.set()` with a joined value, or a generic header-copy loop
that treats `set-cookie` like any other header, produces exactly that.

**What this rules out:** replacing the append loop with a single
`set('Set-Cookie', cookies.join(', '))`, and dropping the special-cased
`set-cookie` branch in `applyWebResponse` in favour of the generic
`headers.forEach` copy.
