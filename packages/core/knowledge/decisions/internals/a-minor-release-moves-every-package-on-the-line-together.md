---
type: decision
title: A minor release moves every package on the line together
description: Changesets are patch-only except for a planned minor declared by a .changeset/release-<version>.json marker, and 0.13.0 moved every 0.12.x package at once rather than core alone
tags: core, release, changesets, versioning
---

# A minor release moves every package on the line together

Every changeset bumps `patch` (`scripts/check-changesets-are-patch.mjs`, run by
`develop.yml`). Under 0.x caret rules a minor of `@pikku/core` is a breaking
release for every package that peers on it: `^0.12.108` admits 0.12.142 but not
0.13.0. So a minor is a planned event, never a side effect of one PR.

**The exception is a marker file.** `.changeset/release-0.13.0.json` names the
packages that may take a `minor` changeset, and the check accepts a minor only
for a listed package whose minor lands exactly on the marker's version. `major`
is never allowed. `.github/changeset-version.cjs` deletes the marker right after
`changeset version` consumes the changesets, so the Version Packages PR that
ships the minor also ends the exception.

**0.13.0 moved the whole line, not just core.** The marker lists every
publishable, non-deprecated package that was on 0.12.x, so `@pikku/core`,
`@pikku/cli`, the runtimes, services and addons are all 0.13.0, and "Pikku 0.13"
names one set that was built and tested together. Moving only the packages whose
API broke would have left `@pikku/express@0.12.18` next to `@pikku/core@0.13.0`,
with nothing but the peer range to say they belong together. Packages that were
not on 0.12.x keep their own line and take a patch: `@pikku/kysely` was already
on 0.13.x, and `@pikku/n8n-import` and `@pikku/voice-agents` are on 0.0.x.

No `fixed` group was added to `.changeset/config.json`. After 0.13.0 the
packages drift apart again under patch changesets, as they did on 0.12.

**Ranges move with the versions.** Changesets 3 bumps a peer dependent by
`patch` when the new version leaves its range and rewrites the range to
`^0.13.0`; it no longer escalates peer dependents to a major, which on 0.x would
have produced 1.0.0. `check-peer-dependency-consistency.mjs` fails on any
internal range, in any dependency field of any workspace, that excludes the
version of the workspace package it names, so a range changesets did not reach
is caught before it ships.

**What this rules out:** a minor or major changeset without a marker, a marker
that outlives its release, and a 0.x minor of core that leaves sibling packages
peering on a range that excludes it.
