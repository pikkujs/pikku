---
type: decision
title: A scaffolded surface is authenticated unless the config opts out in writing
description: scaffold.<feature> became boolean | { auth, path }, where true means authenticated — going public requires typing { auth: false }, and the legacy 'auth' | 'no-auth' strings are refused rather than coerced
tags: config, authorization, codegen, scaffold
---

# A scaffolded surface is authenticated unless the config opts out in writing

`scaffold.<feature>` was `'auth' | 'no-auth' | false`. Two things were wrong
with it, and they compounded.

The auth dimension asked the wrong question of some features and the right one
of others. For `rpc` it is a blanket "no anonymous RPC in this app", set on a
dispatcher that cannot know what it dispatches to — wrong the moment one
legitimately public sessionless function exists. For `userAdmin` it was
redundant: the generated functions are `pikkuFunc` with `scopes:
['admin:users:list']`, gated twice over already. But for `agent`, `workflow`,
`events` and `scenarios` it was the _only_ gate, because those generate real
endpoints the app never authors and has nowhere else to declare a gate for.
A uniform collapse to boolean would have silently opened four surfaces.

And the value read like a preference. `"rpc": "no-auth"` looks like a
starter-file setting; it was a live authorization decision, three directories
from the functions it governed. That is the shape the console incident took.

The type is now `boolean | { auth?: boolean; path?: string }`. `true` means
enabled **and authenticated**; a surface becomes public only by writing
`{ auth: false }`. Omitting a field can then never open anything — the failure
mode of a forgotten flag is a locked door. Features with no auth dimension
(`webhook`, `remoteRpc`, whose generator hardcodes `auth: false`) simply ignore
it.

The object form is also what makes the legacy strings safe to remove. An
earlier design used `string` for the output path, under which `"no-auth"` would
have parsed as _a file named `no-auth`_ — every unmigrated config silently
producing nonsense instead of failing. With `boolean | object`, a string is
never valid, so `resolveScaffoldFeature` refuses `'auth'` and `'no-auth'` by
name and prints the replacement. Coercing them was rejected outright: the value
it would coerce to is the one that caused the incident.

Reading happens once, in `pikku-cli-config.ts`, so a legacy value fails at load
with the migration named rather than downstream where it has already become
something plausible.

**What this rules out:** a bare `true` that means "public"; inferring a
feature's auth posture from its default; using `string` for the output path
while the legacy string values still exist in the wild; and collapsing the auth
dimension uniformly across features that do not all have one.
