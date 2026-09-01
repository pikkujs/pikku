---
name: pikku-build
description: >-
  Use to build on Pikku — turning a fresh scaffold into a working app (quick spike, real product,
  or a showcase that exercises every surface), adding a feature to an app that already exists, and
  the one-off cleanup right after a template is cloned. Covers the knowledge base, personas and
  roles, milestone planning, the scenario that proves each one, theming, multi-app layouts and
  deploying. TRIGGER when: the user asks for an app to be built on Pikku, a freshly scaffolded
  project needs turning into a product, the user asks to add a feature or wire up a new endpoint
  in a working app, or a template was just cloned or scaffolded. DO NOT TRIGGER when: the user
  asks for a one-off edit to an existing function, asks about Pikku concepts (use pikku-concepts),
  or wants one specific surface explained rather than built (use that surface's skill).
allowed-tools: Bash(yarn pikku meta *), Bash(yarn pikku all *), Bash(yarn tsc), Bash(git status *), Bash(git diff *), Bash(git switch *), Bash(git checkout *), Bash(git checkout -b *), Bash(git add *), Bash(git commit *), Bash(git rm *), Bash(git mv *), Bash(git log *), Bash(git branch *), Bash(yarn pikku fabric report *), Bash(npx --no pikku fabric report *)
argument-hint: '[feature description]'
---

# Build on Pikku

## Which mode

| The situation | Read |
| --- | --- |
| A template was just cloned or scaffolded, and the tree still looks like one | `references/post-clone.md` first, then come back |
| A real product, meant to be picked up by someone else | `references/app.md` — the default |
| A spike, a throwaway demo, an idea nobody has committed to | `references/quick.md` |
| A showcase meant to exercise every Pikku surface | `references/platform.md`, which is a delta on top of `references/app.md` |
| A feature added to an app that already has its knowledge base and milestones | `references/feature.md` |

**App is the default.** A small or toy-sounding app does not make it Quick;
only an explicit signal of speed or throwaway-ness does. Platform is not "App
plus more effort" — it is App plus a deliberate surface checklist, so read the
base first and follow it in full rather than blending the two into one plan.

The supporting references belong to whichever mode sends you to them:
`references/multi-app.md` (a second frontend), `references/theming.md`
(authoring the theme), `references/ship.md` (deploying, and the Fabric-readiness
contract).

## Bootstrap before anything else

```sh
bunx --bun pikku bootstrap
```

Once, now — not later when you start building. It wires the `#pikku` alias the
generated code depends on, and on a fresh scaffold **every command that touches
codegen fails until it has run**, including ones you would reasonably reach for
while still planning. Those failures look alarming and are nothing but this.

## What holds in every mode

- **The branch and the diff are the contract.** There is no plan JSON. A
  reviewer sees real, compiled, working code: apply is a merge, reject is a
  `git branch -D`.
- **Discover before editing.** `yarn pikku meta context --json` returns
  functions, wires, middleware, permissions, workflows, `capabilities` and
  `layout` in one call. Fall back to targeted `meta` commands only for a full
  schema or a workflow's steps.
- **`metaLocale` in `pikku.config.json` is the language of authored meta** —
  every `description`, `title` and step `template` the console renders.
  Identifiers stay English whatever it says, and the product's own language
  lives in `messages/*.json`.
- **`pikku all` is the gate.** Run it after touching functions, wirings or
  schemas, and treat its criticals as real.

## What NOT to do

- **Do not skip ahead in App mode.** Knowledge, then people, then milestones,
  then one milestone at a time, each proven by a scenario before the next
  starts. The order is the method.
- **Do not let a Quick build be mistaken for a real one.** It skips
  `knowledge/`, milestone planning, design direction and refusal scenarios — say
  so out loud to the user when you finish, and point at the way out.
- **Do not introduce a wire of a type whose `capabilities.<type>` is `false`**
  unless the user asked for it.
- **Do not hand-edit generated files** — `.pikku/`, `*.gen.*` or the SDK. Fix the
  source and regenerate.
- **Do not invent a role.** An invented role becomes invented screens; build only
  the roles the user named.
