---
'@pikku/addon-console': patch
'@pikku/addon-admin': patch
'@pikku/console': patch
---

Tell a console screen whose addon isn't wired apart from one that failed.

The console UI is a static bundle the CLI serves at `/console`, so every screen
ships to every deployment — but `@pikku/addon-console` edits source files and is
normally wired in development only, and `@pikku/addon-admin` is a deliberate
opt-in. The difference used to surface as whichever request a screen happened to
fire first failing on its own.

Each addon now carries a `ping` whose only job is to be found. An unwired addon
fails name resolution and answers `RPCNotFoundError` (404), which means exactly
one thing: resolution runs before the session check, so 200, a 401 from
`wireAddon({ auth: true })` and a 403 all still mean *wired*, and so does a
network error — the screen renders and reports its own failure rather than
claiming an addon is missing on a dropped connection.

`admin:ping` is new; `console:ping` already existed and keeps its `{ pong: true }`
contract. Screens are gated by group in the router, and the addon setup tab's
OAuth section — the one admin-backed piece of a console-backed screen — gates
itself inline.
