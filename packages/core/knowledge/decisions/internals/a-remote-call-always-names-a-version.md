---
type: decision
title: A remote call always names a version, and an unknown version is refused
description: invokeRemoteAddonFunction sends fn@vN — the caller's, or the newest in the consumer's SDK — and rpcExposed answers a version it no longer has with RPCNotFoundError instead of the latest
tags: rpc, addon, versioning
---

# A remote call always names a version, and an unknown version is refused

A `wireRemoteAddon` consumer is built against one SDK. The host behind
`serverUrl` deploys on its own schedule, and `fn` on the host means *its*
latest, which can be a contract the consumer has never seen.

**The consumer names the version.** `invokeRemoteAddonFunction`
(`wirings/rpc/rpc-runner.ts`) sends an explicit `ns:fn@vN` unchanged. For a bare
`ns:fn` it looks the name up in `pikkuState(<package>, 'rpc', 'meta')`, which
the consumer's codegen fills from the SDK's `latestVersion` (cli
`remoteAddonDefaultVersions`, written into the rpc meta file). So
`POST /rpc/fn@v2` goes out even after the host has added v3. An SDK cut before
versions were packed registers nothing, and the bare name is sent as before.
Neither does a function that was never versioned: the default is the SDK's own
id for the latest version, and for an unversioned `fn` that id is `fn`. A host
looks an addon's function up by its exact id (`function.meta[fn]`), so
sending `fn@v1` there would be a 404 against every host, old or new.

**The host does not fall back.** `resolvePikkuFunction` resolves an unknown
`fn@vN` to `rpc[fn]` — internal callers rely on that (workflows and the
function runner's "resolved to" warning), so it stays. `rpcExposed`, which
serves the public `POST /rpc/:rpcName` route and every remote-addon call, runs
`refuseUnknownVersion` first: a versioned name with no exact rpc meta entry is
an `RPCNotFoundError` (404) whose message says the version is no longer served
and the SDK needs updating. `handleHTTPError` keeps that message, so the
consumer sees it. The one exception is `fn@v1` against an unversioned `fn`,
which is its own v1 — the contract hashes count it that way too.

**What it rules out:**

- a consumer pinned to v2 silently receiving v3's output shape;
- a removed version answering with whatever is latest instead of a 404;
- the host, rather than the consumer's SDK, deciding which contract a call gets.
