---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/react': patch
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

Identity the browser owns is resolved server-side, and can now be created there
too. `cookieAnalyticsIdentity` reads GA4's `client_id` and Meta's `fbp`/`fbc`
off first-party cookies; `mintCookie` writes one that is not there yet, which is
what lets an app collect nothing on the page at all. Both formats are public and
server-side minting is documented by the vendors — it is the mechanism behind
server-side tagging, offered here as a wired resolver rather than a second
container to operate.

Minting is gated on consent, because writing the cookie is itself the act
consent governs — a minter that runs before the banner is answered has already
done the thing the send gate was meant to prevent. `composeAnalyticsIdentity`
exists to make that expressible: resolvers run in order and each sees what the
ones before it produced, so the reader that finds consent necessarily precedes
the minter that needs it. Every required purpose must be granted, not any.

`anonymousAnalyticsIdentity` fills the gap that made anonymous product analytics
dishonest. `pikkuUserId` is derived from a session and so is absent for exactly
the visitor it would need to identify, which left a sink choosing between
collapsing every anonymous visitor into one shared literal and dropping the
pre-signup funnel entirely. The id is `httpOnly` by default: no browser script
needs it, and a cookie scripts cannot touch is not subject to the seven-day cap
browsers place on script-set ones.

On the client, `createAnalytics` takes an `enabled` predicate checked at each
flush. A boolean would be captured before anyone had answered the banner, so
accepting mid-session would never start and withdrawing would never stop.
Refused events are discarded rather than held, so changing your mind does not
release a backlog.
