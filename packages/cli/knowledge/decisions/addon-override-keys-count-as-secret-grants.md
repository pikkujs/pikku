---
type: decision
title: An addon's override keys count as grants in the deploy manifest
description: The analyzer merges an addon's grant list with the keys of its overrides, and lists addons with an unscoped global secret or credential apart from scoped ones
tags: cli, deploy, secrets, credentials
---

# An addon's override keys count as grants in the deploy manifest

The deploy analyzer builds the list of secrets and credentials each wired addon may read.
An addon that sets `globalSecrets` or `globalCredentials` is unscoped and goes into its own
list with its reason (`packages/cli/src/deploy/analyzer/analyzer.ts:1034-1037`,
`analyzer.ts:1047-1050`). Every other addon contributes only the names it is granted
(`analyzer.ts:1041-1044`).

The granted names are the union of the grant list and the keys of the override map
(`analyzer.ts:1026-1031`). The comment says why: scoping is checked before the rename, so an
override key is a name the addon may read even though it never declared it.

**What this rules out:** computing the granted set from the grant list alone. That would drop
a name an addon can read from the manifest, and the manifest would understate what the addon
reaches.
