---
'@pikku/console': patch
'@pikku/core': patch
'@pikku/inspector': patch
---

Make personas a first-class surface rather than a detail of the test runner.

A persona is now read in three places — the knowledge base resolves `persona:`
URIs against it, scenarios cast it as an actor, and a virtual user runs as it —
so it gets its own page at `/personas` under a new **People** section in the
rail, alongside Users. The card is a profile: avatar, name, job title, computed
address, the system roles they hold, and how many scenarios cast them. Opening
one expands each role to the scopes it confers, which is the half of the picture
that explains a 403.

`definePersonas` takes an optional `avatarUrl` — any URL a browser can load.
Nothing is derived from the address: a persona's address is synthetic, so a
derived identicon would be the same shrug for everyone. Omitted, the console
keeps drawing the deterministic colour-and-icon avatar from the persona's id.
