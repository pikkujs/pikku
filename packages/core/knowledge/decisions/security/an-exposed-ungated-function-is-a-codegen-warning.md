---
type: decision
title: An exposed function with no gate is reported at codegen, not at boot
description: The check runs in the inspector where function meta and every wireAddon declaration are both in hand, because neither source alone can tell a gated function from an ungated one
tags: authorization, inspector, addon, rpc
---

# An exposed function with no gate is reported at codegen, not at boot

The generated `POST /rpc/:rpcName` dispatcher forwards to `rpc.exposed`, which
refuses anything without `expose: true`. That makes the reachable set small and
deliberate — someone typed it. What it does not do is check whether the target
is gated, because a dispatcher cannot know what it is dispatching to. The
console shipped ~54 privileged functions through exactly this gap, and nothing
in the toolchain said so.

The check belongs next to `validateAuthSessionless`, in the inspector, for one
reason: it needs two sources that only meet there.

`sessionless` records the baseline — a `pikkuFunc` always requires a session —
but a `pikkuSessionlessFunc` may still tighten itself with `auth: true`, which
the inspector previously discarded. It is now recorded on function meta, so
"sessionless and ungated" is distinguishable from "sessionless and
self-gated" without running anything.

The second source is `wireAddon`. Its `scopes` and `auth` apply to every
function in the package on every wiring path (see
[addon scopes](./addon-scopes-are-resolved-where-the-function-runs.md)), so a
function with no gate of its own may still be fully covered. The inspector
already parsed `wireAddon` for its endpoint and its secret, variable and
credential overrides, and dropped `scopes`, `auth` and `tags` — the addon's
plumbing was recorded in full and its authorization was not. Reading function
meta alone would have reported every console function as open.

An addon whose gates are not statically knowable — a spread, a const reference —
is recorded as absent, and absent is read as **gated**. This is deliberately the
wrong way round from how a runtime gate fails: a false negative costs one
missing warning, while a false positive on a correctly-secured addon costs
confidence in every warning the tool emits, which is worth more than the one
case it would catch.

Severity is `warn`, not `critical`. `expose: true` on an ungated sessionless
function is legitimate for a genuinely public endpoint — a health check, a
sign-up — so this cannot block a build without breaking correct programs. It
fails a build only under `--fail-on-warn`.

**What this rules out:** checking at boot, where the report arrives after
deployment; checking in `pikku validate` from `.pikku` JSON, which does not
carry `wireAddon` at all; and treating an unparseable addon gate as no gate.
