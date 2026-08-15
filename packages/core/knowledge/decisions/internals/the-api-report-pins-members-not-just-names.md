---
type: decision
title: The API report pins members, because the export list only pins names
description: public-surface.json catches an export appearing or vanishing; it cannot see a method added to an interface, which is the change that breaks a consumer's build
tags: core, api
---

# The API report pins members, not just names

`public-surface.json` records `Object.keys(module)` for every entry point. That
is a real guard — it caught a new `./node-host-resolver` subpath and five
renames during a rebase — but it only sees _names_.

It cannot see:

- a method added to `MetaService`, which has 32 members
- a field on `ChannelMeta` becoming required
- a parameter added to a method on `PikkuWorkflowService`, which has 104
- any change at all to an `interface`, since types are erased before
  `Object.keys` can enumerate them

Those are the changes that break a consumer's build, and there are far more of
them than there are exports — roughly two members for every name. The report's
own summary counts both, live, so the figure is not repeated here to rot: an
earlier hand-count in this note was already wrong by 40 members within a day of
being written.

Demonstrated rather than assumed: adding `probeAddedMember(): void` to
`MetaService` leaves `public-surface.test.ts` passing 3/0, and fails
`api-report.test.ts`.

So `api-report.md` is generated from the type checker — every exported symbol
with its full signature, interfaces and classes rendered as their declarations
so member changes land in the diff. It is committed, and the test fails when
the code and the report disagree. Regenerate with `yarn api-report`.

**What this rules out:** treating `public-surface.json` as the API guard. It
guards the front door; this guards the rooms. Both are needed, and the export
list is the cheaper of the two to run — which is why it stayed.

Re-exports are resolved through `getAliasedSymbol` before the signature is
taken. Without that, 624 of the symbols reported as `any`, which would have
pinned nothing while looking like it did.
