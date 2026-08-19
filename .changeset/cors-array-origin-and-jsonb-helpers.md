---
'@pikku/core': patch
'@pikku/kysely-postgres': patch
---

cors: stop naming the first allowlist entry for a disallowed origin, and add jsonb binding helpers

`cors()` with an array `origin` used to fall back to `origin[0]` whenever the
request origin was not in the allowlist, so every response carried a
valid-looking `Access-Control-Allow-Origin` naming an origin the caller was not.
Browsers still blocked the request, but as an origin _mismatch_ rather than
"origin not allowed", and `curl` showed the same fixed origin for every request
including bogus ones — which sent people debugging the wrong layer. A request
origin that is not on the list now gets no `Access-Control-Allow-Origin` and no
`Access-Control-Allow-Credentials` at all, plus a debug-level log naming the
rejected origin. A request with no `Origin` header is not a cross-origin request
and likewise no longer receives a fabricated one. Wildcard and single-string
`origin` behaviour is unchanged.

`@pikku/kysely-postgres` now exports `jsonbText`, `jsonbValue` and `jsonbMerge`.
postgres.js infers a bound parameter's type from the cast that follows it and
JSON-encodes anything it believes is jsonb, so a hand-written
``sql`coalesce(...) || ${JSON.stringify(patch)}::jsonb` `` arrives
double-encoded and merges into a two-element array instead of an object. The
helpers route the value through an intermediate `::text` cast, which is correct
on every driver.
