---
type: decision
title: Every admin function carries one `admin:<domain>` tag
description: Each function names one domain with a admin:-prefixed tag so the code city can split the addon into buildings, and the prefix keeps the tags away from a consuming app's own
tags: admin, tags, code-city
---

# Every admin function carries one `admin:<domain>` tag

Every function in `packages/addon/pikku-admin/src/functions` declares a single
`tags: ['admin:<domain>']`. The code city draws one building per distinct tag
combination, so one tag each gives one building per domain. The domains are
users, scopes, credentials, flags, triggers, webhooks, audit, agents, workflows, virtual-users, runtime.

The prefix is deliberate. A tag also drives a consuming app's backend filter
(`packages/cli/src/utils/config-keys.ts:243`, applied over the app's own
`functions.meta` at `packages/inspector/src/utils/filter-inspector-state.ts:1067`),
the CLI's `cli` unit detection (`packages/cli/src/deploy/codegen/per-unit-codegen.ts:277`),
the `pikku`/`pikku:*` coverage exemption (`packages/core/src/wirings/workflow/scenario-coverage.ts:70`)
and tag-scoped middleware, so a bare `users` could collide with an app's own tag.

Today none of those reads an addon function's tag. Tag middleware resolves
against the addon's own tag groups (`packages/core/src/middleware-runner.ts:260`,
`pikkuState(packageName, 'middleware', 'tagGroup')`), and deploy grouping reaches an addon by
namespace (`packages/cli/src/deploy/analyzer/grouping.ts:225`), not by function tag.
The prefix is a naming guard, not a fix for an active leak. The colon is the
hierarchy separator `getTagGroups` already understands
(`packages/core/src/utils.ts:61`): middleware registered on `admin` inside the addon
would cover every `admin:*` tag.

The tags live in the addon's verbose function meta
(`.pikku/addon/function/pikku-functions-meta-verbose.gen.json`), which the addon
build copies into `dist`; the slim meta omits them.

`src/function-tags.test.ts` fails a function that has no tag or a tag outside
the `admin:` prefix.

**What this rules out:** bare tags such as `users`, a second domain tag on one
function (each combination is its own building), and noise tags like `public`.
