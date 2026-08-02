---
type: decision
title: Addon package roots resolve by walking node module search paths
description: LocalMetaService finds an addon's directory by scanning resolve.paths, not by require.resolve, because addon packages expose no main entry
tags: services
---

# Addon package roots resolve by walking node module search paths

`LocalMetaService.resolvePackageRoot` (`packages/core/src/services/meta-service.ts`)
builds a `createRequire` anchored one level above `.pikku` — the app root — then
walks `require.resolve.paths(packageName)` and takes the first candidate
directory that contains a `package.json`. The result is memoised in
`packageRootCache`.

The obvious call, `require.resolve(packageName)`, throws for these packages:
Pikku addon packages ship a `.pikku` directory and subpath exports but no main
`exports` entry, so there is nothing for Node to resolve to. Walking the search
paths asks the same question Node would ask — where would this package be
found from the app root — without requiring the package to be importable.

**What this rules out:** replacing the loop with `require.resolve(pkg)`,
`import.meta.resolve`, or `createRequire(import.meta.url)`. The first two fail on
every addon; the third anchors resolution at `@pikku/core`'s own location rather
than the app's, so an addon installed only in the app's `node_modules` becomes
invisible.
