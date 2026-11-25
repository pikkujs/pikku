---
type: decision
title: The provider lock has one writer, and CI implies --frozen
description: pikku all writes the providers section of pikku-addons.lock in one place, a version bump with an unchanged surface is rewritten silently outside --frozen and accepted under it, and CI=true makes a change to the approved surface a build error
tags: [cli, provider, lock, ci]
---

# The provider lock has one writer, and CI implies --frozen

`syncProvidersLock` is the only writer of the `providers` section of
`pikku-addons.lock`; the `sdks` section stays with the remote addon sync, which
preserves `providers`. It runs once per `pikku all`, not in deploy codegen
children or in the root pass of a root plus main package project (the main
package's entries would be dropped).

Outside `--frozen`, a new provider is recorded and announced, a version or meta
hash change with the same surface is rewritten without a word (the surface is
what a reviewer approves, not the version), a provider no longer opted in is
dropped, and a changed surface is PKU395 until `--approve-providers` names it.
`--approve-providers` last on the command line means all; ids go in as
`--approve-providers=a/b,c/d` because the array parser would swallow a following
flag.

`--frozen` refuses a new entry, an entry whose surface changed, a removed one and a
lock not in the form pikku writes it (PKU396). `CI=true` implies it. Version and
meta hash are not part of the approved surface, so under `--frozen` a version bump
with an unchanged surface passes and the approved entry is kept: `changeset
version` bumps workspace addons without running `pikku all`, and refusing it
would fail the first CI run of every release.

A version 1 lock (remote addon SDKs only) reads as version 2 with an empty
`providers` section. While neither the project nor the lock has an addon
provider, neither writer checks or rewrites it, so upgrading the CLI does not
fail `CI=true` builds.

**What this rules out:** a build that quietly changes the approved surface in CI,
and verifier scripts that build projects opting in to addon providers without
`unset CI`.
