---
name: pikku-build
description: >-
  App-level Pikku work: new app, conversion, feature or endpoint, post-clone cleanup. Load pikku-concepts first. Not one-off function edits, changeset plans (pikku-architect) or a changes queue (pikku-changes).
allowed-tools: Bash(yarn pikku meta *), Bash(yarn pikku all *), Bash(yarn tsc), Bash(git status *), Bash(git diff *), Bash(git switch *), Bash(git checkout *), Bash(git checkout -b *), Bash(git add *), Bash(git commit *), Bash(git rm *), Bash(git mv *), Bash(git log *), Bash(git branch *), Bash(yarn pikku report *), Bash(npx --no pikku report *)
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

- A template was just cloned or scaffolded, and the tree still looks like one: `references/post-clone.md` first, then come back
- A real product, meant to be picked up by someone else (the default): `references/app.md` (index), then the phase file it names for your phase
- A spike, a throwaway demo, an idea nobody has committed to: `references/quick.md`
- A showcase meant to exercise every Pikku surface: `references/platform.md`, read together with `references/app.md`
- A feature added to an app that already has its knowledge base: `references/feature.md`
- Writing or fixing the scenarios that prove a changeset (app §7, §7a): `references/scenarios.md`
- Before the first screen is built, a picture of the screens or a design direction: `references/design.md`
- Authoring or changing the theme (app §8a): `references/theming.md`
- A screen needs data no function returns yet: `references/mocks.md`
- Adding a second frontend (app §4), at the changeset that needs it: `references/multi-app.md`
- Shipping as a desktop or Android app: `references/native-app.md`
- Deploying, and the deploy-readiness contract (app §9): `references/ship.md`
- The request is built on an OpenAPI spec (auth mode, sign-in or connect screen): `references/openapi.md`

**App is the default.** A small or toy-sounding app does not make it Quick; only an explicit signal of speed or throwaway-ness does. Platform is App plus a deliberate surface checklist: read both files, follow the base in full, do not blend them into one plan.

Apart from `app.md`, which indexes its own phase files, each reference names the topics it leans on but never tells you to open another file; this list is the only routing. Open a reference when its line matches, not up front.

## Bootstrap before anything else

```sh
bunx --bun pikku bootstrap
```

Once, now. It wires the `#pikku` alias the generated code depends on; on a fresh scaffold **every command that touches codegen fails until it has run**, including ones you reach for while planning. Those failures are only this.

## Start from what you were handed

When the request comes with a file or URL, look at it before planning. Two kinds are converted first, then built on:

- An **OpenAPI / Swagger spec** (top-level `openapi` or `swagger` key, a `paths` object): say "This is an OpenAPI spec — I'll turn it into an addon first." Pick the auth mode in `references/openapi.md`, then follow the `pikku-addon` skill's OpenAPI reference.
- An **n8n export** (an object with `nodes` and `connections`, an array of them, or a `{ workflows: [...] }` wrapper): say "This is an n8n workflow — I'll import it first." Follow `pikku-n8n-import`.

Say it at once, in one line, and start: this is not a question for the user. Generate the whole spec, however large.

Neither is the app. When the conversion compiles, carry on in the mode the request calls for (App by default), planning changesets around what the user wants to do with the API or workflow, and reaching the generated functions through `ref()`.

## What holds in every mode

- **The branch and the diff are the contract.** A reviewer sees real, compiled, working code: apply is a merge, reject is a `git branch -D`. The changeset's plan is your own denominator, measured by `pikku knowledge plan progress`, never something a reviewer is handed instead of the code.
- **Discover before editing; there are two questions.** What THIS PROJECT has wired: `pikku meta context --json` returns functions, wires, middleware, permissions, workflows, `capabilities` and `layout` in one call (it is one long line of JSON, so filter it with `jq`, never `head`; use targeted `meta` commands only for a full schema or a workflow's steps). What PIKKU ITSELF offers: `pikku doc <door|export>`, the installed surface with every option key and a worked example: `pikku doc scheduler wireScheduler pikkuVoidFunc` beats reading `node_modules/@pikku/core`. **Never open node_modules to find a signature, and never write a Pikku import, export name or option key you have not seen in `pikku doc`.** Project-local imports need no such check.
- **`capabilities.<type>` reports what this app USES, not what pikku offers.** `false` means no wire of this type is declared yet, not that the surface is unavailable. When a plan calls for a scheduled task and `capabilities.scheduler` is `false`, check `pikku doc` for the door before concluding you cannot build it.
- **Write the change early and spend calls on the change.** Read the files the request names and the one nearest example, then write. Do not `ls` or `find` through `apps/`, `packages/` or `blocks` to audit state unrelated to the request, and ignore notes from a loop or earlier run that the owner did not ask for. A skill's worked example is the call shape: write it and let `pikku all` and `tsc` correct it before looking up each signature.
- **The checks are `pikku all`, `tsc` and `pikku validate`.** On an existing app `pikku validate` reports errors that predate you (a hundred or more is normal). Run it once, after the change, and filter the output to the files you touched (`pikku validate 2>&1 | grep -F <path>`); do not re-run it to see the total move.
- **`metaLocale` in `pikku.config.json` is the language of authored meta**: every `description`, `title` and step `template`. Identifiers stay English whatever it says, and the product's language lives in `messages/*.json`.
- **`pikku all` is the gate.** Run it after touching functions, wirings or schemas, and treat its criticals as real. A run that fails on a critical still records the contract hashes it got to, so the next run adds a PKU861 drift on top of the original error, and `pikku versions update` cannot clear it because codegen refuses first. Fix the real diagnostic first, then delete those contracts' entries from `versions.pikku.json` and re-run; they are re-recorded. Deleting is right only for a contract first recorded INSIDE the changeset you are building. A contract that shipped and genuinely changed shape gets `version: N+1` on its `pikkuFunc({...})` followed by `pikku versions update`; deleting its entry erases a version a client is holding.
- **A table is declared, not migrated.** Declare it in `db/tables.ts`, run `pikku db generate` for the SQL, and never write a migration by hand. It reaches the database through `pikku db migrate` (or `pikku db reset`, which wipes first). `pikku dev` does not apply one, and will serve a schema older than the declaration; the failure surfaces as a function reading a missing column. Run `pikku db migrate`, then restart the dev server. Never put an underscore before a digit in a column name: `address_line_1` writes correctly from `addressLine_1` and reads back as `addressLine1`, so a saved value comes back missing with no error. Follow the columns already in `db/tables.ts` (`addressLine1`), and check a new one round-trips before building on it.
- **A changeset that needs a plan is planned before it is built, and the plan then stays fixed.** `changes claim` says whether it needs one. The plan (tables, functions, wires, roles, scopes, screens, scenarios, in passes) is written through `pikku knowledge plan set <changeset>` (how: `pikku-architect`) in its own turn before any of that changeset's code exists, and `pikku knowledge plan progress` measures the build against it from the generated meta. Never edit the plan afterwards to match what you built; that is grading yourself.
- **Print the links whenever the stack comes up, and in every hand-over.** Full, clickable URLs, with ports from what `bun run dev` actually printed. A person hunting for the port assumes the app did not start.
  - **App**: the frontend's URL (`http://localhost:7104` in the template; each frontend in `frontends` in `pikku.config.json` has its own port)
  - **API**: `http://localhost:3000`

## Report what pikku got wrong, as it happens

Whenever pikku or a skill costs you time (a command that failed on a fresh tree, a skill describing a flag the CLI does not have, generated code you had to fix by hand), file it then, as the `pikku-report` skill describes. Leave out secrets, tokens and customer data.

Findings are held until hand-over. The last thing in the hand-over, after the app runs (and is deployed, if they chose to), is the `pikku-report` send step: if it lists findings and asks, ask the user (Yes, No, Always or Never) and run it again with `--consent <answer>`. If it says reporting is off, do not ask.

## Who you are talking to

The prompt asks first how technical the person is: **not technical**, **technical, no code**, or **developer** (the default when unsaid). Report in plain words at that level, and give the links `bun run dev` printed (app and API). No per-feature deep links.

Not technical and technical, no code: never put code in the conversation, including snippets and command lines; say what changed in the person's words and point at the running app. Developer: as normal.

## What NOT to do

- **Do not skip ahead in App mode.** Knowledge, then people, then changes, then one changeset at a time: planned, built, proven by a scenario, and closed against its plan before it merges.
- **Do not close a changeset your plan says is unfinished.** Build the missing item, or defer it with a reason through `pikku knowledge plan defer`. Never edit the plan to match what you built, and never drop an item silently.
- **Do not let a Quick build be mistaken for a real one.** It skips `knowledge/`, changesets and plans, design direction and refusal scenarios. Say so to the user when you finish, and point at the way out.
- **Do not introduce a wire of a type whose `capabilities.<type>` is `false`** unless the user asked for it; an approved changeset plan counts as asking. Build the wires it names and flip the capability, rather than refusing planned work because the flag still reads `false`.
- **Do not assume an addon's mounted route works because it mounted.** An addon's singleton services are narrowed to what its own factory returns plus config, logger, schema, variables and secrets; the host's `queueService`, `kysely` and the rest never reach it. A handler asking the host for one answers 500 on every call, with codegen, typecheck and the route table all clean. Send one real request at the surface a mounted contract claims before building scenarios on it; when it cannot work, wire your own function on the same path (the host's services are yours) and report the addon bug upstream rather than working around it in the caller.
- **Do not hand-edit generated files** (`.pikku/`, `*.gen.*` or the SDK). Fix the source and regenerate.
- **Do not invent a role.** An invented role becomes invented screens; build only the roles the user named.
