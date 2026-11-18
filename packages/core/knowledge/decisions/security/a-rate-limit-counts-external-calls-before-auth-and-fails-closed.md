---
type: decision
title: A rate limit counts external calls before auth and validation, and fails closed
description: The limit is checked in the HTTP and MCP runners ahead of the function, never on internal calls, with no trusted client address by default and a refusal when the service or its store is missing
tags: core, security, rate-limit
---

# A rate limit counts external calls before auth and validation, and fails closed

`addGlobalRateLimiter` sets one limit for every HTTP route and MCP tool, and a
function's own `rateLimit` replaces it (`false` exempts the function). The check
is `enforceRateLimit` in `packages/core/src/rate-limit/rate-limit-runner.ts`,
called by the HTTP runner and the MCP runner just before the function runs.

**Why in the wire runners.** Only an external call should be counted. A
middleware attached by tag can reach a function through an internal `rpc`, queue
or workflow call, and on Cloudflare a request crosses several Workers through
service bindings, so a check in `runPikkuFunc` would count one request once per
hop. The runners are the one place a call is known to come from outside.

**Why before auth and validation.** A refusal is the same 429 whether or not the
call would have succeeded, so the limit gives an attacker no oracle. This is the
same reasoning that made the removed passphrase lock refuse a correct passphrase
during its lockout window: a guess that behaves differently from the others is a
confirmed guess.

**Why there is no default client address.** `PikkuHTTPRequest` has no address
accessor, so the address can only come from a header, and a header the client can
set is not something to trust by default. `ipHeader` names the header a proxy
sets (`cf-connecting-ip`, or `x-forwarded-for`, whose first entry is used).
Without it every caller shares one bucket per route or tool and a warning says
so. That is safe, and a denial of service on a busy route, which is why the
warning exists.

**Why it fails closed.** A limit with no `rateLimitService` answers 500 rather
than skipping the check, and a store that throws answers 503. `onStoreError:
'allow'` is the opt-in for letting calls through while the store is down.

**What this rules out:** counting internal calls, a refusal that tells a correct
call from an incorrect one, a default trusted header, and a limit that silently
does nothing when its service is missing.
