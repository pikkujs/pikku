---
type: decision
title: A cookie the caller sets wins over the jar's copy of the same name
description: createCookieJar sends the caller's cookie for a name and drops the jar's copy of that name, so one request never carries the same cookie twice
tags: core, scenario, cookies
---

# A cookie the caller sets wins over the jar's copy of the same name

In `createCookieJar` (`packages/core/src/services/scenario-cookie-jar.ts`)
the jar builds the outgoing `cookie` header from the caller's own header and the
jar's held cookies. A held cookie is left out when the caller's header already
names it. The code comment says a request that already carries a session "is
stating which one it means, and emitting the jar's copy alongside it sends the
same name twice."

The rule is per name, not per request. Cookies the caller did not name still go
out from the jar. The jar's `Set-Cookie` handling, which replaces a reissued
cookie rather than sending both, is covered by
[Scenario sessions are isolated per actor and reset between scenarios](workflow-scenario-sessions-are-isolated-per-actor-and-per-scenario.md).

**What this rules out:** sending two values of one cookie name in a request, and
letting the jar's held session override a session the caller has chosen to send.
