---
'@pikku/cli': patch
---

Give the console bearer token the scopes the console gates itself on.

`scaffold.console` emits two things that contradicted each other. The console
wiring gates the whole addon — `wireAddon({ name: 'console', package:
'@pikku/addon-console', scopes: ['admin'] })` — while the auth scaffold minted
the bearer session as `userSession: { userId: 'pikku-console-token' }`, holding
no scopes at all. `verifyScopes` fails closed, so a console authenticating with
`PIKKU_CONSOLE_TOKEN` was admitted and then refused on every `console:*` RPC,
reads included, with `MissingScopeError: Missing required scope: admin`.

An external console could therefore reach a deployment while being unable to do
a single thing in it, and `console:installAddon` — which carries its own
`scopes: ['admin']` — could never run. The failure reads as a broken console
rather than a missing grant, because nothing in the surface names the scope.

The token session now carries `scopes: ['admin', 'pikku']`: the two roots the
console addon's own functions sit under. Roots rather than a wildcard, since a
parent grant already satisfies its children (`admin` covers `admin:*`, `pikku`
covers `pikku:scopes:*` and `pikku:audit:*`) while `*` would additionally hand
the token every scope the host application declares.
