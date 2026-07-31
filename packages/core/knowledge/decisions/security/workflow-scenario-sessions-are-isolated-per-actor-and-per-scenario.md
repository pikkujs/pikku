---
type: decision
title: Scenario sessions are isolated per actor and reset between scenarios
description: One jar per actor keeps two personas from sharing a session; a browser reset keeps one scenario from leaving the next signed in as somebody else
tags: workflow
---

# Scenario sessions are isolated per actor and reset between scenarios

`createCookieJar` in `scenario-cookie-jar.ts` holds its `Map` as a closure
local, so two jars can never share a session. That is precisely what lets one
scenario sign in as several people without one of them inheriting another's
session. Every response is read, not just the sign-in, so a cookie the target
rotates mid-session is followed rather than dropped, and an empty `Set-Cookie`
value is treated as a deletion — the name is dropped rather than held as a
cookie whose value says it is gone. The jar also stamps `Origin`, because Better
Auth rejects a state-changing POST whose Origin does not match its baseURL.

`ScenarioCookieJar.empty` reports a fact about the jar, not about the session: a
target that sets a CSRF or locale cookie before anyone signs in fills the jar
without establishing a session. Anything needing to know whether a sign-in
happened has to track the sign-in itself.

The browser side has the same requirement. `ScenarioBrowserProvider.reset`
discards every actor's per-scenario state — cookies, storage, open pages — while
keeping the browser, and is called between scenarios so one scenario cannot
leave the next signed in as somebody else.

**What this rules out:** hoisting the jar to a module-level or per-service map,
sharing one jar across actors, reading `Set-Cookie` only from the sign-in
response, treating `empty === false` as "signed in", or skipping `reset` between
scenarios as an optimisation.
