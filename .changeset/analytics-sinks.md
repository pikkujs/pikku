---
'@pikku/core': patch
'@pikku/cli': patch
---

Analytics can fan out to several destinations, and carry the identity an ad
platform needs.

`fanOutAnalytics` composes any number of destinations into one
`AnalyticsService`, so a single-destination app never meets it and a sink is the
same class whether it runs alone or beside three others. Destinations are
settled rather than awaited in sequence: `flush()` runs inside the invocation,
so a slow vendor must not add its latency to the request and a vendor that is
down must not cost the others their events.

Each destination takes an optional `accepts` predicate. Which events a
destination receives is the app's policy — a product-analytics tool wants
everything, an ad platform wants three conversions — while what an event should
look like once it arrives is the sink's, and belongs in its mapper rather than
in a central mapping table that would push vendor trivia into every app.

`AnalyticsIdentity` gains `vendorIds` and `consent`. GA4 keys on a `client_id`
from the `_ga` cookie and Meta on `fbp`/`fbc`; neither is derivable from a user
id, so a server-side sink without them does not degrade, it sends nothing
usable. Both are resolved server-side through an `analyticsIdentity` resolver on
singleton services, never read from the event body — the same rule the rest of
the identity already follows, so a crafted client call cannot attribute an event
to someone else. `cookieAnalyticsIdentity` covers the common first-party-cookie
case; a consent tool that packs every purpose into one encoded blob writes its
own resolver, which is why the resolver is a function.

A resolver returns nothing off a wire with no browser behind it, so a cron task
and a queue worker never invent a vendor id.

The analytics leaf re-exports the runtime, so an app reaches the whole surface
through `#pikku/analytics` — wiring where events go sits next to declaring them,
and splitting that across two specifiers splits one concern across two names.
