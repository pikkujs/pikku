---
type: decision
title: An addon's .pikku meta ships at the package root or under dist, and readers probe both
description: The layout depends on the addon's build and files field, so a consumer resolving the directory by path must try `<pkg>/.pikku` and `<pkg>/dist/.pikku` before concluding an addon declares nothing
tags: services
---

# An addon's .pikku meta ships at the package root or under dist, and readers probe both

An addon generates `.pikku/` at its project root, and whether that directory
reaches the published tarball at the root or inside `dist/` depends on the
addon's own `tsconfig` and `files` — both layouts are in the wild and both are
supported. The published `exports` map hides the difference for anyone
resolving by specifier: `"./.pikku/*"` points at wherever it landed, so
`require.resolve('<pkg>/.pikku/scopes/pikku-scopes-meta.gen.json')` works for
either shape, and that is the resolution every consumer should prefer.

Code that builds the path itself must probe both. `addonPikkuDir`
(`packages/addon/pikku-console/src/lib/derive-instance-overrides.ts`) tries
`<pkg>/.pikku` then `<pkg>/dist/.pikku` and returns `null` when neither exists.
The reason to say so out loud is the failure mode: a reader that assumes the
root finds nothing under a `dist`-shipping addon and cannot distinguish that
from an addon that declares no secrets, variables or scopes at all. Both answers
are "empty", and the wrong one is indistinguishable from a correct one until
something downstream reports an addon as ready when its secrets were never
checked.

**What this rules out:** hardcoding either path in a consumer, and treating a
missing directory as evidence an addon declares nothing without having tried
both. It also rules out normalising the layout by making the CLI move the
directory at publish time — the export map already makes the layout private to
the package, and the addons shipping each shape are already published.
