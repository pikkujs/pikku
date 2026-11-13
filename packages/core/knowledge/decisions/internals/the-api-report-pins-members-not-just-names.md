---
type: decision
title: The API report pins members, because the export list only pins names
description: public-surface.json catches an export appearing or vanishing; it cannot see a method added to an interface, which is the change that breaks a consumer's build. The report is generated in CI and commented on the PR, not committed
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
so member changes land in the diff.

**It is not committed.** It used to be, with a pre-commit hook regenerating it
and a test failing when it was stale. That cost more than it bought:

- Any two branches touching the public surface rewrote the same ~7000 lines and
  collided on every rebase, which a merge driver papered over and
  "regenerate after merging main" commits then paid for.
- The report resolves `@pikku/core/*` imports through core's own `dist/`. The
  pre-commit hook regenerated it in whatever install the committer had; in an
  incomplete one (core not built) those imports resolve to `any`, and the
  commit quietly wrote `jwt: any` where the real signature says
  `jwt: JWTService | undefined`. A stale-report test cannot tell a wrong
  report from a right one.

So the `API report` workflow (`.github/workflows/api-report.yml`) builds core
from the PR's base and from its merge result, both in CI, diffs the two with
`scripts/api-report-diff.sh`, and keeps one sticky PR comment with the diff, or
"No public API changes". Reviewers still see the member-level diff; nobody
commits or merges it. To see it locally, build core and run
`bun run --filter @pikku/core api-report` (output is gitignored).

**What this rules out:** treating `public-surface.json` as the API guard. It
guards the front door; this guards the rooms. Both are needed, and the export
list is the cheaper of the two to run — which is why it stayed.

Re-exports are resolved through `getAliasedSymbol` before the signature is
taken. Without that, 624 of the symbols reported as `any`, which would have
pinned nothing while looking like it did.
