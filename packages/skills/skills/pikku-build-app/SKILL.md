---
name: pikku-build-app
description: >-
  Build a real product on open-source Pikku using the full Fabric workflow, run locally — knowledge
  base first, personas and roles, milestones planned then built one at a time, each proven by a
  scenario, with a design pass. The default build mode, and the one that stays importable into
  Fabric later. TRIGGER when: the user asked for an app to be built on Pikku and picked "App" (or
  did not pick), a freshly scaffolded pikku project needs turning into a product, or the user says
  "build this properly / so someone can pick it up". DO NOT TRIGGER when: the user asked for
  something quick or throwaway (use pikku-build-quick), wants every platform surface demonstrated
  (use pikku-build-platform), or is adding one feature to an app that already has its knowledge
  base and milestones (use pikku-feature).
---

# Build a product on open-source Pikku

You have a scaffolded project with skills installed. This skill owns everything
from here: no Fabric account, no card, no hosted build — while keeping the
project shaped so `pikku fabric init` later adopts it with zero rework.

**Four phases, and you do not skip ahead:**

1. Write the knowledge graph — what the app IS, before any code
2. Declare the people and the apps — personas, roles, frontends
3. Plan the milestones — the buildable pieces, in dependency order
4. Implement them one at a time — each proven by a scenario before the next starts

## Agent Operating Procedure

1. Discover before editing. Run `pikku info functions --verbose --silent` and
   read `AGENTS.md` before your first change.
2. Make the smallest source change that satisfies the task. Keep generated files
   generated — never hand-edit `.pikku/`, `*.gen.*`, or the SDK.
3. Validate with the narrowest relevant command, then `pikku all` when functions,
   wirings, schemas or generated clients may have changed.
4. If validation fails, fix the source cause and rerun. Do not paper over
   generated errors by editing generated files.

## 0. Bootstrap, before anything else

```sh
bunx --bun pikku bootstrap
```

One command, run once, now — not later when you start building. It wires the
`#pikku` import alias the generated code depends on. On a fresh scaffold `.pikku/`
is empty, so **every command that touches codegen fails until this has run** —
including ones you would reasonably reach for while still planning, like
`pikku persona list`. Those failures look alarming (`Cannot find module
'#pikku/workflow/pikku-workflow-types.gen.js'`, `Schema generation failed for 16
schemas`) and they are nothing but this missing step.

`pikku knowledge index` and `knowledge validate` work without it — which is why
the planning phases below are safe either way.

## 1. One more round of questions — then stop asking

Ask **three to five** questions that actually change the schema or the screens,
in one message. Then stop; do not interview the user.

- **Who uses it — who are the distinct kinds of people?** Ask this however small
  the app is. The answer becomes §3's personas and roles, and you build only the
  roles they name.
- **What are the two or three core objects?**
- **What is the main thing someone does on their first visit?** This answer
  becomes the second milestone, not the tenth.
- **One app or several?** Separate apps on separate hosts, or one app with paths.
  Cheap to answer now, expensive after the routes exist.
- **What should it look like?** The template ships one theme — "Neutral", a
  deliberately unopinionated monochrome scaffold — and **nothing in the
  open-source toolchain will ever replace it for you.** Accept any of: keep
  Neutral (fine for an internal tool, but say so out loud); a direction in words;
  a reference (brand guide, screenshots, a site whose register they want); or
  their own design agent/prompt, whose output you take as the direction.

Skip anything you can decide yourself. If nobody answers, assume one app with
paths, the roles implied by the request, Neutral, English — and say so.

---

## PHASE 1 — What the app is

## 2. Write the knowledge graph — before any code

`knowledge/` is not documentation you write at the end. It is the record of what
the app IS, in the words its users use, and it is the one part of the project
another agent picks up and continues from. **Nothing gets built until there is a
milestone note to build.**

Read `knowledge/index.md` and the `pikku-knowledge` skill, then write the notes
for what the user just told you. A project whose `knowledge/` is still only the
shipped index is a project nobody can resume.

Five sections, each answering exactly one question:

- `milestones/` — what is one buildable piece, and what proves it works
  (some scaffolds call these `slices/`; follow the name `knowledge/index.md`
  uses — `knowledge validate` accepts either)
- `entities/` — what a thing IS, in the words users use for it
- `decisions/` — what was chosen and what that rules out.
  `decisions/security/` for who may reach what, `decisions/design/` for how it
  looks and behaves
- `questions/` — what you asked and never got an answer to
- `wishlist/` — what someone wants that nobody has asked you to build

Rules that make it a graph rather than a pile of files:

- **A note's path is its identity.** Markdown, YAML frontmatter, `type` required.
  Cross-link notes with plain markdown links — that is what makes it a graph.
- **Create a section the turn you have a note for it**, with its own `index.md`
  written in the same turn. Never scaffold empty directories, and never leave
  notes flat at the root: a `product.md` and a `glossary.md` at `knowledge/` is
  not a knowledge base, and it leaves the project unbuildable.
- **A milestone note carries `status`** (`proposed` → `dispatched` → `built`,
  nothing else), **at most three `entities`** (past three it is not one piece —
  split it), and **its scenario as a fenced ` ```gherkin ` block in the third
  person** — `Given 'owner' has no entry`, never `Given I …`. A quoted word
  MEANS a persona, so quote only personas you declare in §3 and write domain
  values bare. That block becomes a real scenario in §7.
- **Record only what pikku cannot tell you.** Tables, columns, function
  signatures, routes, wirings, permissions and roles are all discoverable with
  `pikku info` / `pikku meta`. Copying them into a note gives you a second copy
  that goes stale. Knowledge is the why: decisions, constraints, what a thing
  means.

Three decisions belong here on day one, because every later choice leans on them
and none is discoverable from code:

- **How the product is split into apps**, and why (§4) — `decisions/`
- **What each kind of person may reach**, in domain language — `decisions/security/`
- **What the app should look like** — the direction from §1 (§8) — `decisions/design/`

Then keep it honest — both must pass, and `validate` is a real gate:

```sh
bunx --bun pikku knowledge index
bunx --bun pikku knowledge validate
```

---

## PHASE 2 — Who it is for, and what it is made of

## 3. Declare the people — personas and roles

The answer to "who uses it" becomes code, in one file:
`packages/functions/src/personas.ts`. It ships with a single `visitor`; add the
people the user named, and the roles they imply.

```typescript
import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'
import { defineSystemRole } from '#pikku'

defineSystemRole({
  owner: {
    displayName: 'Owner',
    description: 'Runs their own properties — sees only what they own',
    scopes: [],
  },
  tenant: {
    displayName: 'Tenant',
    description: 'Lives in one unit — sees only their own tenancy',
    scopes: [],
  },
})

definePersonas({
  visitor: { name: 'Visitor', jobTitle: 'Synthetic health-check user', account: {} },
  amina: {
    name: 'Amina',
    jobTitle: 'Property owner',
    personality: 'Checks arrears first, every single time',
    roles: ['owner'],
    account: {},
  },
  bilal: {
    name: 'Bilal',
    jobTitle: 'Property owner',
    personality: 'A second owner — exists so "you see yours, not theirs" is testable',
    roles: ['owner'],
    account: {},
  },
  chidi: {
    name: 'Chidi',
    jobTitle: 'Tenant',
    personality: 'Reports the boiler, wants to know it was seen',
    roles: ['tenant'],
    account: {},
  },
})
```

- **Keep `visitor`.** The shipped scenarios name `actors.visitor`, and PKU677
  requires a browser step's actor to be a literal `actors.<name>`. Removing it
  stops `actors.visitor` type-checking, which fails `pikku all`, and nothing you
  write after that registers.
- **One `definePersonas` call for the whole project.** Codegen builds the
  `PersonaId` union from it, materialises one scenario actor per person, and
  seeds a user row each. A second call site is a second answer to "who uses this
  app".
- **`roles` is typechecked against `defineSystemRole`.** An undeclared role is a
  build error rather than a runtime surprise.
- **Never write an email address.** Each is derived from the persona id and
  `scenarios.emailDomain` in `pikku.config.json` — `visitor@actors.local`.
  Hand-writing one is how a run signs in as somebody who was never created.
- **Declare a second person of the same kind** whenever the rule is ownership
  (`bilal` above). "You see yours, not theirs" is not testable with one owner,
  and §7 is where it gets caught.
- **Build the roles the user's answer produces, no more.** An invented role
  becomes invented screens and invented rules, and it is the user who has to
  live with them.
- **Roles are what a permission check reads, not where it lives.** The check goes
  in the function's `permissions` field (§6), never in the body. Read the
  `pikku-permissions` skill.

`pikku persona list` shows who is declared and `pikku roles audit` reports roles
the database still holds that code no longer declares — both need §0's bootstrap
to have run, and both are worth a look once it has.

**One warning about the scaffold's own notes:** `knowledge/index.md` may claim
the people live in `pikku.config.json`, put there by a `fabric persona` command.
That is stale. In this template they live in `personas.ts` as above, and
`pikku.config.json` carries no personas key at all — only `scenarios.emailDomain`.
Trust the file you can read over the note describing it.

## 4. Declare the apps — one API, several frontends

### The rule that makes it cheap

**One backend, many frontends. Never fork `packages/functions`.**

Every app imports the same generated SDK (`@project/functions-sdk`) and calls the
same RPCs. What differs is which screens exist and what the shell looks like.
What must NOT differ is the data layer: two copies of a `listProperties` function
is two places for the permission check to be wrong.

**The app split is presentation, not security.** A tenant app that simply never
renders the arrears screen is not access control — it is a hidden button.
Security is the `permissions` field on the function, and it holds whether the
caller arrived from the admin origin, the tenant origin, curl, or the generated
client. Build the split for clarity, and prove the boundary with a refusal
scenario in §7.

### Choosing the split

- **Separate apps on separate hosts** (`admin.example.com`, `portal.example.com`)
  — when the two audiences share almost no screens, when they should not see each
  other's brand register, or when one may later ship independently.
- **One app with paths** (`/app/admin/*`, `/app/portal/*`) — when they share most
  of the shell and the difference is a handful of screens. Cheaper, and honest:
  two nav trees in one app is still two apps to a user.

Either way, write the choice and its reason into `knowledge/decisions/`.

### Adding a second frontend — later, not now

Recording the decision is Phase 2 work. **Creating the directory is not.**
Cloning `apps/app` materialises a folder of copied screens, so it belongs to the
milestone that first needs the second app, not to planning.

When you get there, read `references/multi-app.md`. It carries the clone, the
`package.json` edits, the `pikkufabric.config.json` frontends map, the dev-runner
change that otherwise silently never starts your second app, the per-frontend
scenario environments, and how sessions behave across two origins.

What Phase 2 owes you now is only this: the split, its reason, and who each app
serves, written into `knowledge/decisions/`.

---

## PHASE 3 — The plan

## 5. Plan the milestones

Turn the app into an ordered list of buildable pieces, each a note in
`knowledge/milestones/`, each `status: proposed` with a gherkin block.

What a milestone is:

- **One buildable piece, at most three entities.** Past three it is not one piece.
- **Vertical, not layered.** "The owner sees this month's arrears" is a
  milestone — migration, function, screen, scenario. "Add the database schema" is
  not; it is a step inside one.
- **It ends in something a person can do**, in a browser, signed in as a named
  persona. If you cannot write the gherkin, you cannot build it yet — that is a
  `questions/` note, not a milestone.

How to order them:

1. **The spine first.** The one object everything else hangs off, and the screen
   that proves the app exists at all.
2. **Then the loop the user named as "the main thing someone does on their first
   visit."** That answer from §1 is the second milestone, not the tenth.
3. **Then each audience's own surface**, one at a time. With two apps, finish one
   app's spine before starting the other's — a half-built app in each is worse
   than one working app.
4. **Refusals ride along with the milestone that creates the thing being
   refused**, never as a "permissions" milestone at the end. A milestone that
   creates a row and does not say who may not see it is not finished.

Number the files (`01-…`, `02-…`) so the order is visible in the tree. Then
`knowledge index && knowledge validate` before you write a line of code.

**Show the user the list before building.** This is the last cheap moment to
reorder — after §6 the migrations are numbered and the order is concrete.

---

## PHASE 4 — Build

## 6. Implement milestones, one at a time

**Per milestone** — set its note to `status: dispatched`, do the six steps,
set it to `built`. Do not start the next one until §7 is green for this one *and
§7a shows its functions covered*. A stack of half-milestones cannot be reviewed
and cannot be handed over, and an uncovered function is a half-milestone whether
or not the note says `built`.

1. **Migration.** SQL in `db/sqlite/` at the project root, numbered on from the
   ones already there. Apply with `bunx --bun pikku db migrate`, which also
   regenerates the Kysely types your functions import.
2. **Seed.** Demo rows in `db/sqlite-dev-seed.sql`. **There is no seed command** —
   `bunx --bun pikku db reset` is the only thing that applies the file, and it
   wipes, migrates and seeds in one go (`--no-seed` stops after the migration,
   for working on an empty state the test data would hide). Because reset always
   arrives at a database it just wiped, **the seed file is plain `INSERT`s** — no
   `ON CONFLICT DO NOTHING`, no `INSERT OR IGNORE`. Nothing ever applies it
   twice, so it never has to defend itself. It is also **local only** — no deploy
   applies it, so anything the app would be broken without in production is
   configuration and belongs in a migration, not here.
   Do this generously and do it now: an empty app demos badly and critiques
   badly, and you cannot judge a screen's hierarchy, overflow, or truncation
   against zero rows. Seed rows each persona sees differently — with an ownership
   rule that means seeding rows for the *second* owner too.
3. **Functions.** One `pikkuFunc` per `*.function.ts`. Mark it `expose: true` and
   Pikku generates the typed RPC client and the React Query hooks the UI calls;
   you do NOT write an HTTP route for it. Add `wireHTTP` only for a real REST
   shape (a third-party webhook).
4. **Regenerate:** `bunx --bun pikku all`
5. **UI.** Pages in `<app>/src/pages/`, one route file each in `<app>/src/routes/`,
   calling functions through the generated `usePikkuQuery` / `usePikkuMutation`
   hooks from `@project/functions-sdk/pikku/api.gen`. One component per `.tsx`
   file. Compose the kit from `@/components/<Name>` rather than hand-rolling.
   Register the screen in `useNavItems()` — that one file feeds both the desktop
   sidebar and the phone navigation.
6. **Scenario** (§7), then `status: built`.

Rules that are not optional:

- A function's input and output types come from its `input:`/`output:` zod
  schemas. Never pass generic type params, never annotate the return type inline.
  The schema is the type. (Generics XOR schemas — never both.)
- Auth and permission checks go in the `permissions` field, never in the function
  body. This is what makes §4's app split safe.
- No `process.env` inside a function. Read config through the injected
  `variables` / `secrets` services; `process.env` belongs only in bootstrap. Every
  secret a function reads needs a matching `defineSecret`, or `pikku all` reports
  PKU951 and nobody knows what to provision at deploy.
- Let the database type your values, via `db/annotations.ts`. A `BOOLEAN` column
  is derived for you. On SQLite the other two are **not** — add them by hand,
  once, and they are typed AND coerced end-to-end:

  ```typescript
  export const classifications = {
    payment: {
      paid_at:  { kind: 'date' },                        // -> Date, not an ISO string
      metadata: { kind: 'json', tsType: 'PaymentMeta' },  // -> parsed object, not unknown
    },
  }
  ```

  A `TIMESTAMP`/`DATETIME`/`DATE` column with no entry types as `string`, and a
  `JSON` column with no entry types as `unknown` (the CLI warns PKU481). Add the
  annotation rather than casting around the generated type. Once the file carries
  manual fields, `db migrate` stops overwriting it.
- A `z.date()` on a function's **input** arrives over RPC as an ISO string, not a
  `Date`. Normalise before calling date methods on it (`new Date(value)`), or it
  throws `.getTime is not a function` at runtime — schema validation accepts the
  string without converting it.
- Every user-facing string is a translation key. Never a hardcoded literal. With
  two apps that means two `messages/` directories; a string used by both belongs
  to whichever app renders it, and duplication beats a shared bundle that couples
  the apps together.
- Surface errors. No empty catch, no swallowed promise. If a mutation can fail,
  render the failure inline next to the control that triggered it — not a toast.
- An exposed function with no session and no permission is reachable by anyone
  over `POST /rpc/:rpcName` (PKU574). Either gate it or drop `expose: true`.

Then run it:

```sh
bun run prebuild && bun run dev
```

That starts the API on :3000 and every frontend in `pikkufabric.config.json`. A
frontend running against a dead API looks exactly like an app bug, so if every
request fails, check that both halves came up.

The `--bun` in `bunx --bun pikku …` is load-bearing — keep it. Without it the
CLI's `#!/usr/bin/env node` shebang hands the process to whatever Node is on
PATH, which fails below Node 24 with `ERR_UNKNOWN_BUILTIN_MODULE: No such
built-in module: node:sqlite`.

Open it, sign up, and click through what you built. **HTTP 200 is not evidence.**
The pages are client-rendered: the server returns 200 with an empty shell, so a
page whose component throws still looks fine to `curl`. Open it in a browser, or
drive it headlessly and assert on the text that actually rendered.

## 7. Prove it — scenarios

A scenario is a user journey run as one of your personas, over the real
transport, with that persona's session. It is the only kind of test worth writing
here, because a passing one proves the app works the way a signed-in person
experiences it. Three ship in `packages/functions/test/scenarios/` — keep them
green — and every milestone's gherkin block from §5 becomes one more.

```typescript
import { pikkuScenario } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const tenantReportsAFaultScenario = pikkuScenario<void, { id: string }>({
  title: 'A tenant reports a fault and the owner sees it',
  description: 'The report lands on the owning landlord’s queue, and nobody else’s',
  tags: ['scenario', 'maintenance'],
  func: async (_services, _data, { scenario, actors }) => {
    const report = await scenario.do(
      'reports a broken boiler',
      'createMaintenanceReport',
      { summary: 'No hot water' },
      { actor: actors.chidi },
    )
    await scenario.then(
      'appears on the owner’s queue',
      'reportShowsOnQueue',
      { id: report.id },
      { actor: actors.amina },
    )
    await scenario.then(
      'is invisible to the other owner',
      'reportIsNotVisible',
      { id: report.id },
      { actor: actors.bilal },
    )
    return { id: report.id }
  },
})
```

- **`do` takes an RPC name; `given`/`when`/`then` take a declared step.** A step
  is a `pikkuScenarioStep` that says what a person is doing and holds one
  implementation per surface (server-side by default, plus a `browser` one that
  drives the page). Reaching for an RPC name in a `then` will not resolve.
- **Every scenario must assert.** A ladder of `given`/`when` with no `then` is a
  PKU680 critical — it fails `pikku all`, so it stops codegen rather than a test.
  Coverage counts every step, so without that rule an assertion-free ladder of
  clicks would score a perfect run while checking nothing.
- **Write the refusals.** The third step above is the whole point of §4: one
  persona reaching for another's row has to be rejected, and that rejection is a
  scenario. It is how you prove access control instead of asserting it.
- **Add `SCENARIO_ACTOR_SECRET` to `.env`.** `bun run dev` generates that file
  with a `BETTER_AUTH_SECRET` and nothing else, and without the actor secret
  `/api/auth/sign-in/actor` is disabled — every scenario then fails at sign-in,
  before its first step, for a reason that reads like an auth bug.
- **There is no state reset.** A scenario runs against a live server: scope what
  you create to your own rows and unique ids, and never assume a clean database.

Run them:

```sh
bunx --bun pikku scenario run local --spawn                       # server-side, the fast path
bunx --bun pikku scenario run local --spawn --run browser         # the same journeys, driven as a human
bunx --bun pikku scenario run local-admin --spawn --run browser   # the second app
```

`--spawn` starts and stops the server for the run; drop it if `bun run dev` is
already up. The browser pass needs the environment's `appUrl` and a browser
driver installed — without them the run fails fast rather than half-running.

### 7a. Coverage — which functions have actually been run

Green scenarios tell you the journeys you wrote still work. They say nothing
about the code you never wrote a journey for, and that gap is invisible without
measuring it:

```sh
bunx --bun pikku dev --coverage                        # server, instrumented
bunx --bun pikku scenario run local --coverage         # against that server
```

That writes `coverage/scenario-coverage.json` — which functions each journey
exercised. **A function no scenario touches has never been run by anything but
you, by hand, once.** It compiles, it typechecks, `pikku all` is happy, and
nobody has proven it does what it says.

Run it **as each milestone closes**, not once at the end. Coverage read per
milestone is a short list you can act on — the milestone you just built either
covered its own functions or it did not. Read for the first time after ten
milestones it is a wall of red that nobody triages, and the honest response to a
wall of red is to ignore it.

Every gap is one of three things, and naming which is the point of looking:

- **A missing scenario** — the function matters and no journey reaches it. Write
  the journey. Refusal paths dominate this category, because it is the case you
  are least likely to have clicked through by hand.
- **A function that should not exist** — nothing reaches it because nothing needs
  it. Delete it. An unused exposed function is also reachable over
  `POST /rpc/:rpcName`, so this is a security finding, not only dead weight.
- **Genuinely deferred** — real, not yet reachable from the UI. Say so in the
  milestone note that will cover it, so the gap is a decision rather than a
  hole.

Report the number when you hand the milestone over. A number nobody says out
loud is a number nobody acts on.

## 8. Make it look like someone designed it

Two separate jobs, and conflating them is why open-source builds come out looking
like the template:

- **8a. Direction** — deciding what it should look like. **No open-source tool
  does this.** Fabric has `fabric-theme`; you have §1's answer and this section.
- **8b. Critique** — judging how well the built screens execute that direction.
  `impeccable` does this well, and it is free.

Impeccable audits the design you chose. It will never tell you the app should
have looked like something else — it will happily award a clean bill of health to
a perfectly-executed default. Skip 8a and you ship Neutral with good spacing.

### 8a. Author the theme — the step nothing does for you

The look lives in `packages/mantine-theme`, and it is data, not code:

The look lives in `packages/mantine-theme`, and it is data, not code — one JSON
per theme, `active.json` naming the live one. **Read `references/theming.md`** for
the file layout, what each field changes, and how to turn a direction in words
into a theme.

Two things that belong here rather than in the reference, because they govern
every screen you then build:

**Set the theme once, don't hardcode colours per component.** A screen full of
inline `color="blue"` and one-off hex values is why apps look templated. Change
the theme, not the components — and keep it theme-aware for light and dark.

With two apps, **share the theme package and vary the register, not the
palette.** A back-office can be denser and more tabular; a customer-facing app
can be roomier and warmer — that is `structure` and layout, not a second `brand`.
Two unrelated colour schemes read as two products from two companies.

Then **write the direction into `knowledge/decisions/design/`** — the words the
user gave you, what you chose, and what it rules out. The JSON records what the
theme is; only the note records why.

### 8b. Compose real components, then critique

**Compose with Mantine's rich components — not tables and text everywhere:**

- **`@mantine/charts`** (Recharts underneath) for overviews — `AreaChart`,
  `BarChart`, `LineChart`, `DonutChart`, `Sparkline`. A metric worth showing is
  worth a chart, not a number in a `Text`.
- **`@mantine/dates`** for anything time-based — `DatePicker`, `Calendar`,
  `DateTimePicker`, range inputs. Never hand-roll a date field.
- Composed layouts over flat lists — `Timeline` for history, `Stepper` for
  multi-step progress, `Card` + `SimpleGrid` for a gallery, `RingProgress` for
  completion, `Badge`/`ThemeIcon` for status.

Both ship in the template's app dependencies. Look each one up in the Mantine
llms.txt and use the real component.

Then critique it. Free, and works across coding agents:

```sh
npx impeccable install     # current releases need Node 22.18+
```

Impeccable scores a screen against interaction heuristics and names what is
wrong: hierarchy, spacing, type registers, states you forgot. Run it on **every**
screen in **every** app, fix what it finds, and re-run the ones you changed.

Screenshot each page and feed it the images. Without them its findings drop to
inference from source, and it misses real misalignment, contrast, and overflow.
Judging your own UI from source code is guessing.

**Screenshot at a phone width too (≈390px), not just desktop, and critique
those.** A layout that is fine at 1440px routinely breaks at 390 — a table that
overflows, a row of buttons that wraps into a pile, text jammed against the edge,
a modal taller than the viewport. Mantine gives you the tools (responsive `Grid`,
`visibleFrom` / `hiddenFrom`, `Stack` instead of `Group` at small sizes); use
them. The template already mounts a phone navigation per `AGENTS.md` — pick
`MobileTabBar` or `MobileNavDrawer` deliberately per app, never both.

The gate: **no P0 findings left on any screen, in any app, at either width.**
Don't silence a finding by deleting the feature it is about.

## 9. Ship it, and stay Fabric-ready

When every milestone is `built` and the scenarios are green, read
`references/ship.md`. It carries the open-source deploy paths (`--provider
standalone`, `cloudflare`, `aws`), how to serve several frontends behind one
API, the pre-release gate to run, and the contract that keeps `pikku fabric init`
a one-command import later rather than a migration.

Two things from it are worth knowing before you get there, because they are
cheaper to honour than to retrofit:

- **Nothing hardcodes a host, a port, or a `process.env` read inside a
  function.** Secrets go through `defineSecret` and the injected `secrets`
  service. This is the most common reason a working local project fails its
  first deploy, on any platform.
- **Generated files stay generated.** No hand edits to `.pikku/`, `*.gen.*`, or
  the SDK.

## Reference

- `references/multi-app.md` — adding a second frontend (§4), at the milestone
  that needs it
- `references/theming.md` — authoring the theme (§8a)
- `references/ship.md` — deploying, and the Fabric-readiness contract (§9)
- Sibling skills: `pikku-knowledge` (§2), `pikku-permissions` (§3),
  `pikku-scenario` (§7, §7a), `pikku-deploy-cloudflare` and `pikku-fabric` (§9)
- Project conventions written by the template: `AGENTS.md`
- Doing less than this: `pikku-build-quick`. Doing more: `pikku-build-platform`.
