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
- **Discover before editing, and there are two questions, not one.** What THIS
  PROJECT has wired: `pikku meta context --json` returns functions, wires,
  middleware, permissions, workflows, `capabilities` and `layout` in one call
  (fall back to targeted `meta` commands only for a full schema or a workflow's
  steps). What PIKKU ITSELF offers: `pikku doc <door|export>` — the surface of
  the pikku installed here, every option key with what it is for, and a worked
  example. `pikku doc scheduler wireScheduler pikkuVoidFunc` answers in one call
  what reading `node_modules/@pikku/core` answers slowly and wrongly. **Never
  open node_modules to find a signature, and never write an import, an export
  name or an option key you have not seen in `pikku doc`.**
- **`capabilities.<type>` reports what this app USES, not what pikku offers.**
  A `false` there is "no wire of this type is declared yet", so the rule below
  about not introducing one is about not widening an app's surface on a whim —
  it is not a statement that the surface is unavailable. When a milestone's plan
  calls for a scheduled task and `capabilities.scheduler` is `false`, check
  `pikku doc` for the door before concluding you cannot build it.
- **`metaLocale` in `pikku.config.json` is the language of authored meta** —
  every `description`, `title` and step `template` the console renders.
  Identifiers stay English whatever it says, and the product's own language
  lives in `messages/*.json`.
- **`pikku all` is the gate.** Run it after touching functions, wirings or
  schemas, and treat its criticals as real. A run that fails on a critical still
  records the contract hashes it got to, so the next run adds a PKU861 drift on
  top of the original error — and `pikku versions update` cannot clear it,
  because codegen refuses before it gets there. Delete those contracts' entries
  from `versions.pikku.json` and re-run; they are re-recorded. Fix the real
  diagnostic first, or you will chase the echo instead. Deleting is right only
  for a contract first recorded INSIDE the milestone you are building — nothing
  has consumed it, so there is no version to keep. A contract that shipped and
  then genuinely changed shape gets `version: N+1` on its `pikkuFunc({...})`
  followed by `pikku versions update`; delete its entry and you erase a version
  a client is holding.
- **A new migration reaches the database through `pikku db migrate`, and
  nothing else.** `pikku dev` does not apply one — it will happily serve a
  schema older than the file you just wrote, and the failure surfaces as a
  function reading a column that is not there yet. Run `pikku db migrate`, then
  restart the dev server. And never put an underscore before a digit in a column
  name: `address_line_1` writes correctly from `addressLine_1` and reads back as
  `addressLine1`, so a value saved through the query builder comes back missing
  with no error anywhere. Follow the columns already in `db/sqlite/`
  (`address_line1`), and check a new one round-trips before building on it.
- **A milestone is planned by a different seat than the one that builds it.**
  The plan — tables, functions, wires, roles, scopes, screens, scenarios, in
  passes — is written through `pikku knowledge plan set` by `pikku-architect`,
  and `pikku knowledge plan progress` measures the build against it from the
  generated meta. A builder who writes its own plan is grading itself.

## What NOT to do

- **Do not skip ahead in App mode.** Knowledge, then people, then milestones,
  then one milestone at a time — planned, built, proven by a scenario, and
  closed against its plan before the next starts. The order is the method.
- **Do not close a milestone your plan says is unfinished.** Build the missing
  item, or defer it with a reason through `pikku knowledge plan defer`. Never
  edit the plan to match what you built, and never drop an item silently.
- **Do not let a Quick build be mistaken for a real one.** It skips
  `knowledge/`, milestone planning, design direction and refusal scenarios — say
  so out loud to the user when you finish, and point at the way out.
- **Do not introduce a wire of a type whose `capabilities.<type>` is `false`**
  unless the user asked for it.
- **Do not hand-edit generated files** — `.pikku/`, `*.gen.*` or the SDK. Fix the
  source and regenerate.
- **Do not invent a role.** An invented role becomes invented screens; build only
  the roles the user named.
