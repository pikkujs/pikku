---
'@pikku/cli': patch
'@pikku/skills': patch
---

fix(cli): a scaffold flag says a surface exists, not who may call it

`scaffold.<feature>` accepted an `auth` field, and the generated wrapper emitted
it onto the wired function. That put authentication in two places at once: the
target function already declares whether it needs a session, its wiring, its
scopes and its addon gate already refine it, and `runPikkuFunc` already enforces
all of that on every call. The scaffold flag only stacked a coarser gate in
front of the one that actually decides, and — being a config field — it could
disagree with the function it was gating.

`PikkuScaffoldFeature` is now `boolean | { path?: string }`. It answers two
things and no more: whether the surface is generated, and where the file is
written. A feature that was `{ "auth": false }` becomes plain `true`, and
`pikku enable` loses its `--noAuth` flag along with the dimension it set.

The six generators that took the flag no longer take one. The four that generate
a dispatcher — public RPC, public agent, workflow routes and the events channel
— now emit a fixed `auth: false`. That is the wrapper declining to gate, not the
scaffold declaring the surface public: `rpcCaller` forwards to whichever
function the caller named, and that function's own `auth`, permissions, scopes
and addon gate are what decide. Emitting nothing would not be neutral, since a
wiring without `auth` requires a session and would reject the call before the
gate that decides ever ran. The two that generate scoped admin functions — user
admin and virtual users — emit no `auth`, because they are `pikkuFunc` with
their own `scopes`: session-required by construction, and the deciding function
rather than a wrapper in front of one.

The legacy `'auth'` / `'no-auth'` string values are gone with it. A bare string
is still refused rather than read as a `path`: under `boolean | object` no
string is valid, so guessing one would turn a typo into a generated file nobody
asked for.
