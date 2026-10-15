---
type: decision
title: Two credentials resolving to one key must agree on whether they are per-user or singleton
description: buildCredentialResolutions throws when two credentials resolve to the same stored key but would be read in different modes, so one cannot silently serve the other's value
tags: core, credentials, overrides, wire
---

# Two credentials resolving to one key must agree on whether they are per-user or singleton

`packages/core/src/wirings/credential/credential-overrides.ts` decides, for each
credential the package declares, where its value is read from.

An override is either a string, which renames the credential, or an object with a
`name` and a `mode` (`credential-overrides.ts:9-16`). The doc comment says the
object form "decides where its value is read from", so one addon can serve a
per-user product and a team account (`credential-overrides.ts:5-7`).

For each name, the resolved key is the override's name or the name itself
(`credential-overrides.ts:56-57`). The mode is the override's `mode`, or else the
type the author declared (`credential-overrides.ts:59-63`). A credential with no
override keeps its declared type (`credential-overrides.ts:38-40`).

If a key is already claimed with a different mode, the function throws
(`credential-overrides.ts:65-74`). The message says the loser "would silently read
the other's value — a per-user credential served from the deployment's own account,
or the reverse" (`credential-overrides.ts:70-72`).

**What this rules out:** a per-user credential and a deployment credential sharing
one stored key, with one quietly serving the other.
