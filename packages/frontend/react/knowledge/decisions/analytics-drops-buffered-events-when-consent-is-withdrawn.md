---
type: decision
title: Analytics drops buffered events when consent is withdrawn rather than holding them
description: The browser analytics client checks its enabled() gate when an event is recorded and again at each flush, and empties the buffer without sending when consent is off
tags: frontend, analytics, consent
---

# Analytics drops buffered events when consent is withdrawn rather than holding them

`createAnalytics` takes an `enabled` function, not a boolean (`packages/frontend/react/src/analytics.ts:19-29`). The doc comment gives the reason: the client is built before anyone has answered the cookie banner, so a value captured at startup would freeze the answer. It also says "Buffered events are discarded rather than held" (`analytics.ts:26-27`).

`push` checks `enabled()` before it buffers an event, so nothing is recorded while consent is off (`analytics.ts:101-106`). The comment at `:103-105` says the check is repeated at flush, so a buffer filled while analytics was off is not sent once consent arrives.

`flush` checks `enabled()` again. If consent is off it sets the buffer to empty and returns without sending (`analytics.ts:63-68`).

The server side reads consent from cookies in a separate path, covered by [consent is read from a cookie](../../../../core/knowledge/decisions/security/consent-is-read-from-a-cookie-and-a-recognised-denial-counts-as-refusal.md). This note covers only the browser client.

**What this rules out:** sending a backlog of events collected before a visitor refused or withdrew consent, and treating the consent answer read at startup as final.
