---
type: decision
title: An addon reads the app's auth when it calls it, not when its services are built
description: getOrCreatePackageSingletonServices gives an addon whose parent has no auth a lazy auth that resolves the app's registered auth at call time, so addon services built while the app's factory is still running do not stay auth-less for the life of the process
tags: core, addons, auth, services
---

# An addon reads the app's auth when it calls it, not when its services are built

The generated `pikkuServices` wrapper attaches the lazy `auth` only after the
app's factory returns (`serialize-setup-types.ts`). An app factory may publish
its services to `pikkuState(null, 'package', 'singletonServices')` and start
its queue consumers before it returns, because some runners never call
`serverLifecycle`. A job delivered in that window resolves its addon's
services from a parent with no `auth`, and
`getOrCreatePackageSingletonServices` caches them per namespace for the rest
of the process. Every later call into that addon then failed with
`auth is not a function`.

When the parent has no `auth` and an `authFactory` is registered, the addon
runner now hands the addon an `auth` that reads
`pikkuState(null, 'package', 'singletonServices').auth` when called and
delegates to it. Once the wrapper publishes its result, that is the one lazy
instance the app owns. Called before then, it throws "auth was called before
the app had finished creating its singleton services".

A parent that already has `auth` keeps its own. A project with no
`authFactory` gets no `auth`.

**Rejected:** attaching `auth` before the app factory runs (the factory builds
its own object, so the wrapper cannot reach it until it returns); keying the
addon cache on the parent object's identity (runtimes pass a fresh spread of
the singleton services per call, so every call would rebuild the addon graph);
not caching while the app factory is in progress (the job in the window still
holds an auth-less copy and fails).

**What this rules out:** an addon's `auth` being a snapshot of whatever the
parent held when the addon's services were first built.
