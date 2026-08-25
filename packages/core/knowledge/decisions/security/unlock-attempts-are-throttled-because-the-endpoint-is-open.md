---
type: decision
title: Unlock attempts are throttled, and a correct passphrase waits too
description: The unlock endpoint cannot require auth, so a lockout window is the only thing standing between a weak passphrase and an offline-speed guessing loop — and exempting the right answer would rebuild the oracle
tags: core
---

# Unlock attempts are throttled, and a correct passphrase waits too

`DataLock.unlock` counts consecutive failures. Five open a lockout window of 30
seconds, doubling with each further failure to a 15-minute cap; a success clears
the count. During a window `unlock` throws `TooManyAttemptsError` **before**
deriving anything.

The throttle exists because the endpoint it protects is deliberately open — see
[[the-unlock-gate-is-served-over-http-not-prompted-natively]] — so nothing else
stands in the way. PBKDF2 at 600k iterations costs about 48ms, which sounds like
a defence until it is divided out: roughly twenty guesses a second, sustained,
against a passphrase a human chose and has to retype. That walks a weak
passphrase in an afternoon.

The part that looks like a bug is that a **correct** passphrase is refused during
the window as well. Exempting it would hand an attacker exactly the oracle the
throttle exists to deny: a guess that behaves differently from the others is a
guess that has been confirmed, and an attacker who can tell "wrong" from "right,
but rate-limited" is no longer rate-limited at all. The cost is that a legitimate
user who typoed five times waits with everyone else.

`DataLock.retryAfterMs` exists so the unlock screen can show that wait as a
countdown. Without it the only way to discover the window has passed is to guess
again — and a guess made during a lockout is itself a failure, which extends the
window it was trying to wait out.

The clock is injected (`new DataLock(vault, { now })`) so the escalation is
testable without real time.

**What this rules out:** exempting a successful unlock from the window,
distinguishing "wrong passphrase" from "rate limited" in a way a caller can
observe before the window ends, and any per-IP scoping of the counter — the
counter belongs to the store, and a desktop app has exactly one client anyway.
