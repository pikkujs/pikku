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
installGroups: [core]
agent:
  tools: read, write, edit, bash, grep
  timeoutMs: 5400000
  acceptance:
    level: verified
    evidence: [changed-files, tests-added, commands-run, validation-output]
    verify:
      - id: knowledge-consistent
        command: pikku knowledge validate
      - id: typechecks
        command: pikku all --tsc-summary
---

# Build on Pikku

## Which mode

| The situation                                                                | Read                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A template was just cloned or scaffolded, and the tree still looks like one  | `references/post-clone.md` first, then come back                         |
| A real product, meant to be picked up by someone else                        | `references/app.md` — the default                                        |
| A spike, a throwaway demo, an idea nobody has committed to                   | `references/quick.md`                                                    |
| A showcase meant to exercise every Pikku surface                             | `references/platform.md`, which is a delta on top of `references/app.md` |
| A feature added to an app that already has its knowledge base and milestones | `references/feature.md`                                                  |

**App is the default.** A small or toy-sounding app does not make it Quick;
only an explicit signal of speed or throwaway-ness does. Platform is not "App
plus more effort" — it is App plus a deliberate surface checklist, so read the
base first and follow it in full rather than blending the two into one plan.

The supporting references belong to whichever mode sends you to them:
`references/multi-app.md` (a second frontend), `references/design.md` (showing
a picture of the screens first, committing to a design direction, and judging
whether the screens realise it — read before the first screen is built, not
after the last), `references/theming.md`
(authoring the theme),
`references/ship.md` (deploying, and the Fabric-readiness contract),
`references/openapi.md` (an app on an OpenAPI spec: the auth mode, the
auth-config format, and the sign-in or connect screen it implies).

## Bootstrap before anything else

```sh
bunx --bun pikku bootstrap
```

Once, now — not later when you start building. It wires the `#pikku` alias the
generated code depends on, and on a fresh scaffold **every command that touches
codegen fails until it has run**, including ones you would reasonably reach for
while still planning. Those failures look alarming and are nothing but this.

## Start from what you were handed

When the request comes with a file or a URL, look at it before planning
anything. Two kinds are converted first and then built on:

| Handed                                                                                                              | Say, then do                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| An **OpenAPI / Swagger spec** — top-level `openapi` or `swagger` key, a `paths` object                              | "This is an OpenAPI spec — I'll turn it into an addon first." Pick the auth mode in `references/openapi.md`, then follow the `pikku-addon` skill's OpenAPI reference. |
| An **n8n export** — an object with `nodes` and `connections`, an array of them, or a `{ workflows: [...] }` wrapper | "This is an n8n workflow — I'll import it first." Follow `pikku-n8n-import`.                                      |

Say it at once, in one line, and start: this is the obvious first move, not a
question for the user. Generate the whole spec, however large.

Neither is the app. When the conversion compiles, come back here and carry on
in the mode the request calls for — App by default — planning milestones around
what the user wants to do with the API or the workflow, and reaching the
generated functions through `ref()`.

## What holds in every mode

- **The branch and the diff are the contract.** A reviewer sees real, compiled,
  working code: apply is a merge, reject is a `git branch -D`. The milestone's
  plan is your own denominator, measured by `pikku knowledge plan progress` —
  never something a reviewer is handed instead of the code.
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
- **A milestone is planned before it is built, and the plan then stays fixed.**
  The plan — tables, functions, wires, roles, scopes, screens, scenarios, in
  passes — is written through `pikku knowledge plan set` (how: `pikku-architect`)
  in its own turn before any of that milestone's code exists, and
  `pikku knowledge plan progress` measures the build against it from the
  generated meta. You plan it and you build it; what you never do is edit the
  plan afterwards to match what you built — that is grading yourself.
- **Print the links whenever the stack comes up, and in every hand-over.** Full,
  clickable URLs, with the ports taken from what `bun run dev` actually printed:
  - **App** — the frontend's URL (`http://localhost:7104` in the template; each
    frontend in `pikkufabric.config.json` has its own port)
  - **API** — `http://localhost:3000`
  - **Console** — `http://localhost:3000/console`, plus a deep link to each
    page that shows what this turn produced (the paths are below)

  A person who has to go hunting for the port assumes the app did not start.

## Keep a BUILD-REPORT.md

Whenever pikku or a skill costs you time — a command that failed on a fresh
tree, a skill that described a flag the CLI does not have, generated code you
had to fix by hand — add an entry to `BUILD-REPORT.md` at the repo root as it
happens: what you ran, what you expected, what happened, and the workaround.
Leave out secrets, tokens and customer data.

At hand-over, show the file and ask the user whether to send it. Only with
their okay, send each entry with `pikku fabric report --stdin` (JSON on stdin;
`"kind": "product"` when pikku behaved wrongly, `"kind": "harness"` with
`"skill"` and `"passage"` when a skill misled you). The `pikku-report` skill
has the fields. When the CLI is not signed in to Fabric, the report is queued
locally rather than sent: say so, and that `pikku fabric findings flush` sends
the queue once they sign in. Do not retry or file it twice.

## Who you are talking to

The prompt asks first how technical the person is: **not technical**,
**technical, no code**, or **developer** (the default when unsaid). Whenever the
build makes or changes something the console can show, give the
`http://localhost:<port>/console/...` link instead of describing it.

Until the app is deployed that is the local open-source console, on the port
`pikku dev` printed. Once it is on Fabric, link the Fabric console for the stage
you are talking about instead; the `pikku-fabric` skill says which.

| Level              | Links                       | Code in the conversation |
| ------------------ | --------------------------- | ------------------------ |
| Not technical      | Product pages only          | Never                    |
| Technical, no code | Product and technical pages | Never                    |
| Developer          | Product and technical pages | As normal                |

"Never" includes snippets and command lines; say what changed in the person's
words and link to where they can see it.

**Product pages** — the only ones a non-technical person gets:

| Shows                 | Path                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| Knowledge, plans      | `/console/knowledge`, `/console/knowledge?id=<note path>`                 |
| Personas              | `/console/personas`, `/console/virtual-users?persona=<id>`                |
| Roles and permissions | `/console/roles`, `/console/scopes`                                       |
| Scenarios and runs    | `/console/scenarios?id=<id>`, `/console/scenarios?view=runs&run=<run id>` |
| Workflows             | `/console/workflow?id=<id>`                                               |
| Agents                | `/console/agents`, `/console/agents/playground?id=<agent id>`             |

**Technical pages** — never for a non-technical person: `/console/overview`,
`/console/functions`, `/console/surface`, `/console/database`,
`/console/changes`, `/console/wires/http`, `/console/wires/channel`,
`/console/wires/mcp`, `/console/wires/cli`, `/console/wires/gateway`,
`/console/async/scheduler`, `/console/async/queue`, `/console/async/trigger`,
`/console/runtime`, `/console/emails`, `/console/webhooks`, `/console/secrets`,
`/console/variables`, `/console/security`, `/console/auth-providers`,
`/console/addons`, `/console/analytics`, `/console/credentials`,
`/console/users`, `/console/audit`, `/console/flags`, `/console/scorers`.

These come from `packages/console/src/App.tsx`; do not link a path that is not
listed here.

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
