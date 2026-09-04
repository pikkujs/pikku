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
   read `AGENTS.md` before your first change. Read `metaLocale` in
   `pikku.config.json` too: it is the language every `description`, `title` and
   step `template` you write must be in (§1a). Identifiers stay English whatever
   it says.
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
- **What language should the app speak, and what language does the team work
  in?** Two answers, not one — see §1a, which is where they go. Ask only if the
  request is not obviously English; a brief written in English about an English
  product answers both.

Skip anything you can decide yourself. If nobody answers, assume one app with
paths, the roles implied by the request, Neutral, English — and say so.

## 1a. Three languages, and you must not collapse them

A brief saying "the entire UI is German" is about **one** of these. Getting this
wrong has already shipped a project that can never add a second language, so
settle all three explicitly before you write code.

| Axis            | What it covers                                                                                                                       | Where it goes                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Identifiers** | Function, component, type, variable and file names. Database tables and columns. Commit messages.                                    | Nowhere — **always English**, no setting, not negotiable                          |
| **Meta**        | `description` on functions and steps, `name`/`title` on features and scenarios, step `template`, role and persona descriptions        | `metaLocale` in `pikku.config.json`, default `en`                                     |
| **Product UI**  | Every string the app shows a user                                                                                                    | `messages/<locale>.json`, and `defaultLocale` for what a first-time visitor opens in |

**Identifiers are English.** The product's market does not change this and
neither does `metaLocale`. Identifiers are the surface the generated `#pikku/*`
clients, `pikku info`, the typed RPC map and the Kysely types all bind to, and
unlike a string an identifier cannot be translated later — renaming one is a
migration. A German practice management tool gets `getWorklist`, `case`,
`event`, not `getUebersicht`, `vorgang`, `ereignis`.

**Meta follows `metaLocale`.** Write the team's answer into `pikku.config.json` in
this phase, before there is any meta to be wrong:

```json
{ "metaLocale": "de" }
```

It exists for the Pikku Console. Meta is the one part of a project the Console
renders back to a human, so a team working in German reads their own functions,
features and scenario reports in German. Default `en` and do not ask when the
project is obviously English. **On every later run, read this field first and
author descriptions, titles and step templates in it** — a project whose
`metaLocale` you ignored reports half in one language and half in another.

**Product UI is the message catalogue.** `messages/<locale>.json` via
`pikku-i18n`, with `defaultLocale` deciding what a visitor opens in.
`baseLocale` in `project.inlang/settings.json` **stays `en`**: it names the
message source, the catalogue every other language is cloned from, so a project
that repoints it has nothing to translate from and `--add-locale` is broken
forever.

A German medical portal, correctly:

```jsonc
// project.inlang/settings.json
{ "baseLocale": "en", "locales": ["en", "de"] }
// apps/app/src/i18n/active.json   (or: fabric i18n --default-locale de)
{ "defaultLocale": "de" }
// pikku.config.json
{ "metaLocale": "de" }
```

Record the two non-obvious answers as a `decisions/` note in §2 — neither is
discoverable from code, and the next agent will otherwise re-derive them wrong.

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
import { defineSystemRole } from '#pikku/scopes'

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
  `pikku-auth` skill.

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

## 5a. The technical plan — one milestone at a time, before you build it

The milestone note says what the app must DO. The **plan** says what has to
exist for it: the tables, functions, wires, roles, scopes, screens and
scenarios, split into passes. It is JSON, it lives beside the note, and
`pikku knowledge plan progress` measures the finished build against it.

**Read `pikku-architect` and follow it.** The plan is the denominator the
completion check divides by, so a builder who writes their own plan can build a
fraction, plan only that fraction, and certify itself complete. Fabric answers
that by giving the plan its own seat; here the defence is the ORDER, and it only
holds if you keep it: the plan is written against the note in its own turn,
before any of the code it measures exists, and is never edited afterwards to
match what you ended up building. An item that will not land is deferred with
its reason — `plan defer` — not quietly rewritten. Write it before you open a
migration:

```sh
pikku knowledge plan schema                        # the only spec there is
pikku knowledge plan set <milestone> /tmp/plan.json
pikku knowledge plan show <milestone> --for-build  # what you then build
```

**Plan one milestone at a time, at the moment you are about to build it** — not
all of them here. A plan written against a note that later moves is worse than
no plan, and everything after the current milestone is still allowed to move.

---

## PHASE 4 — Build

## 6. Implement milestones, one at a time

**Per milestone** — plan it (§5a), set its note to `status: dispatched`, do the
six steps, close it out (§6a), set it to `built`. Do not start the next one
until §6a passes, §7 is green for this one *and §7a shows its functions
covered*. A stack of half-milestones cannot be reviewed and cannot be handed
over, and an uncovered function is a half-milestone whether or not the note says
`built`.

1. **Migration.** SQL in `db/sqlite/` at the project root, numbered on from the
   ones already there. Apply with `bunx --bun pikku db migrate`, which also
   regenerates the Kysely types your functions import. **Neither `pikku all` nor
   restarting `pikku dev` applies a migration** — so a new column reads as
   `TS2353 … does not exist in type 'InsertExpression<DB, "…">'` on the function
   that writes it. That error means the migration has not run, never that the
   column name is wrong; run `db migrate` before you go looking at the SQL.
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
page whose component throws still looks fine to `curl`.

That click-through is a smoke check, and it is the only thing it is. **Do not
hand-drive a browser tool in place of a test.** Steering Playwright yourself
proves a page rendered once, on your machine, in an order only you remember —
nothing about it re-runs, so the next agent inherits a claim rather than a test,
and a regression lands silently. When a journey is worth driving through the UI,
it is worth writing as a browser step on §7's scenario and running
`pikku scenario run local --spawn --run browser`: same clicks, same assertions,
in the repo, green or red on every future run.

## 6a. Close the milestone against its plan, not against your memory

```sh
pikku knowledge plan progress <milestone>
```

It reads §5a's plan and reconciles it against the generated meta under
`.pikku/` — the function exists or it does not, the route is wired or it is not,
the `pikkuScenario` export is there or it is not. Nothing it reports comes from
what anyone claimed, which is the whole reason it replaced a todo list. It exits
non-zero while anything in the first pass is missing.

Three things it says, and what each one asks of you:

- **MISSING** — the first pass owes it and the meta cannot see it. Either build
  it, or, if it genuinely belongs to later work, move it out with a reason on
  the record:

  ```sh
  pikku knowledge plan defer <milestone> function:sendReminder \
    -r "The email service it needs is the next milestone."
  ```

  **A deferral is capped at two per plan.** Past that, the plan was wrong and the
  milestone is two milestones — say so to the user rather than deferring again.
  What you may never do is drop the item silently: the plan is what the next
  person reads to know what this milestone was for.
- **PROBLEMS** — something exists but does not do what was planned. A function
  planned as restricted whose meta says `auth: false`; a `cascade` no migration
  declares; a browser scenario that opens a page and asserts it is still on it.
  These are never deferred. Fix the app.
- **DEFERRED to a later pass** — already accounted for. Reported so it is
  visible, never blocking.

**Do not set the note to `built` while this exits non-zero**, and do not edit the
plan to match what you built — `plan set` is the architect's seat, and a builder
rewriting its own denominator is exactly what the split exists to stop.

### 6b. Feed the milestone back into the seats

Before starting the next milestone, answer two questions out loud:

- **What did the plan fail to say?** A field nothing wrote, a promise no function
  could keep, a pass 1 that turned out to be two. That is a `pikku-architect`
  lesson.
- **What did the build learn the hard way?** Anything that cost a wasted run —
  a stale process, a scenario that only passes once, a diagnostic that turned
  out to be an echo of an earlier one. That is a `pikku-build` lesson.

Then edit the skill — **at most one change to each per milestone**, and only for
something that actually went wrong here. A rule with no incident behind it is a
guess, and these files are read in full every time: they earn their length by
naming failures a reader would otherwise repeat. Prefer sharpening an existing
line to appending a new one, and delete a rule the last few milestones have
shown to be noise.

The gates are the compounding part. A lesson written into a scenario the suite
runs, or into a check `plan progress` can see, is enforced; the same lesson
written as prose is a thing the next reader has to remember. Reach for prose
only when there is nothing to hang a check on.

## 7. Prove it — scenarios

A scenario is a user journey run as one of your personas, over the real
transport, with that persona's session. It is the only kind of test worth writing
here, because a passing one proves the app works the way a signed-in person
experiences it. Three ship in `packages/functions/test/scenarios/` — keep them
green — and every milestone's gherkin block from §5 becomes one more.

```typescript
import { pikkuScenario } from '#pikku/scenarios'

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
- **Every scenario must assert, and `return await scenario.then(...)` does not
  count as one.** A ladder of `given`/`when` with no `then` is a PKU680 critical
  — it fails `pikku all`, so it stops codegen rather than a test. Coverage counts
  every step, so without that rule an assertion-free ladder of clicks would score
  a perfect run while checking nothing. The extractor reads the body statically,
  and a `then` in `return` position is not seen: seven refusal scenarios here,
  each ending `return await scenario.then('is refused …', …)`, were all reported
  as never asserting. Bind it — `const asserted = await scenario.then(...)` and
  `return asserted` on the next line — which is also how the value stays
  inspectable when the step's output is what the scenario returns.
- **A scenario body is extracted as a DSL workflow, so it is not ordinary
  TypeScript.** Only `const`/`let`, `if`/`else`, `switch`, `for..of`, `return`,
  `throw` and workflow calls survive extraction: a counting `for` is refused by
  PKU679, and so is a `for..of` whose iterable is written inline — it must be a
  named identifier or a field (`data.items`). Bind the seat numbers, the ids,
  the rows to a `const` above the loop and iterate that. One milestone here lost
  a codegen round to each half of that rule, because the first half does not
  imply the second. The rule's quiet half: a shared local helper holding a
  scenario's setup steps does NOT fail extraction — the steps are recorded and
  the suite goes green — but the extractor cannot bind an `actor` that arrives as
  a function parameter, so the transcript credits every setup step to whoever the
  last literal binding named. Seven permission scenarios here read "henrik sets
  up her company Salon Nordlicht" in a suite whose whole point was that the
  company is finja's. Write the setup out in each scenario; a scenario body is a
  recorded document, and the duplication is the price of it saying who did what.
- **Write the refusals, and assert WHY.** The third step above is the whole
  point of §4: one persona reaching for another's row has to be rejected, and
  that rejection is a scenario. It is how you prove access control instead of
  asserting it — but only if the step reads the reason. "Not ok" is also what a
  malformed request returns, and a refusal step that stops at the status code
  passes on a call the function never even ran. One here posted straight to
  `/rpc/<name>` with the function's input as the body; that route validates an
  ENVELOPE (`{ rpcName, data }`), so the input read as a bag of unknown
  properties and came back 422. Asserting the refusal MENTIONED the rule — a
  company, an owner, a scope — is what turned a green false positive into a
  one-line fix.
- **Add `SCENARIO_ACTOR_SECRET` to `.env`.** `bun run dev` generates that file
  with a `BETTER_AUTH_SECRET` and nothing else, and without the actor secret
  `/api/auth/sign-in/actor` is disabled — every scenario then fails at sign-in,
  before its first step, for a reason that reads like an auth bug.
- **There is no state reset.** A scenario runs against a live server: scope what
  you create to your own rows and unique ids, and never assume a clean database.
  A scenario that leaves durable state changed has to put it back — the one that
  archives a product unarchives it, the one that cancels a plan restarts it —
  because its own second run starts where its first one stopped. **Run the suite
  twice and require the second run green.** A suite that only passes on a fresh
  database is a suite that passes once. Two corollaries, both of which cost a
  milestone a red run here: **name nothing a setup step might already own** —
  `setsUpHerCompany` returns the company that actor already has rather than
  renaming it, so a later step passed the literal name it had asked for and was
  told no such company exists; read the name, slug or id back off the step's
  output and pass THAT. And **put rows somewhere the other scenarios are not** —
  an import seeded at the same coordinates as another scenario's salons
  accumulated one row per run until it crowded that scenario's own salon out of
  a nearest-N list. Anything a scenario asserts by proximity, recency or a
  top-N cut is asserting against every row every previous run left behind.
- **A shared step is only as proven as its best-exercised branch.** One here
  read the wrong field off a raw invocation (`attempt.data`; the payload is
  `attempt.body`), so its found-case could never pass — invisible for as long as
  every caller asked for ABSENCE. Drive a new step from both sides in the
  milestone that adds it. The same rule bites from the other end: a step that
  picks "the newest X" stops meaning "the one this scenario just made" the moment
  a second function produces X, so a renewal job that raised invoices broke three
  invoice scenarios that had been green for months. When you add a writer of a
  row an existing step selects by recency, give that step an explicit filter in
  the same change.
- **A route nested under an existing screen is unreachable until its parent
  renders an `Outlet`.** A milestone added `/app/academy/$slug` under an
  `/app/academy` that already had a component of its own; the parent swallowed
  the child, so the editor's URL rendered the list — every link, every route file
  and every type check looked right, and the only thing that noticed was a
  browser scenario that OPENED the child path and found the parent's controls on
  screen. When a milestone deepens a path an earlier one already owns, split the
  parent into a layout (`Outlet`) and an `index` route in the same change, and
  make one scenario open the child by path rather than reach it by clicking.
- **Green twice is not the same as unchanged twice.** Count the rows a run
  writes, run it again, and require the same count — a save that appends where
  it should replace passes every assertion while doubling a table. One here
  re-sent a product's variants without their ids, so the addon read each as new:
  1, 2, 4, 8, and by the nineteenth save 262,144 rows, every run green until the
  request crossed a body-size limit and surfaced as a `413` that read like an
  infrastructure fault. The assertion nobody writes is the count, and it is one
  SQL query.
- **A click returns before its effect lands — assert the effect, then navigate.**
  A browser step's click resolves when the button was pressed, not when the
  mutation it fired came back. So a step that presses "Add to cart" and the next
  one that opens `/app/cart` are in a race with the `onSuccess` that writes the
  cart token to `localStorage`, and the loser arrives at an empty basket. It
  passed on the first run here and failed on the second, which is the worst way
  to find out. Put an assertion on the confirmation between them — the button's
  own "Added", the toast, the row that appeared — so the navigation waits on the
  write instead of on luck. This is also the reason a browser scenario reads
  better than it tests when it is only clicks: every `when` that writes wants a
  `then` before the next page.
- **A control the browser cannot NAME is a control it cannot drive.** A testid is
  derived from a message key at build time, which has two consequences that only
  show up when a scenario tries to press something. A label chosen at runtime —
  `label={isCancel ? m.a() : m.b()}` — derives no key at all, so the field is
  unreachable and the failure reads as a missing element rather than a
  conditional. Write the two controls out separately, each with its own static
  call. And every row of a list carries the SAME keys, so `pause` on a list of
  twelve licenses is twelve matches and a strict-mode violation; scoping by text
  does not save it either, because a button's own text is "Pause" and not the
  row's. Give the row an address of its own — `data-testid={id.slice(0, 8)}` on
  the card, rendered beside the title so a person can read it too — and address
  the control `within` it. Both of these are screen defects before they are test
  defects: a field whose label changes identity under it, and a list whose rows
  are indistinguishable to anyone on the phone to support.
- **Never hard-code the target's origin.** A raw-HTTP step — a webhook, a
  check-in a scanner posts — runs in the CLI process, not on the server, so it
  has to be told where to post. That is `wire.scenarioStep.env.apiUrl`, which
  carries the environment and whatever `--api-url` overrode it. A literal
  `http://localhost:3000` does not merely break on another port: it silently
  posts into whatever else is listening there, so the scenario goes green having
  never touched this app at all.
- **A scenario step's input is a recorded contract, and it does not take a
  version.** Widening one — an extra optional field so a step can name a
  particular row — trips PKU861 exactly like a function's does, but the fix that
  works for a function does not work here: adding `version: 2` to a
  `pikkuScenarioStep` makes the runner unable to find the step at all, and every
  scenario using it fails with `Function not found`. Add a NEW step beside the
  old one instead. That is the better answer anyway, because a step that has
  grown an optional field is usually two questions wearing one name — "does she
  have an invoice like this" and "what became of the invoice I am holding" — and
  the scenarios read better once they say which one they are asking.

Run them:

```sh
bunx --bun pikku scenario run local --spawn                       # server-side, the fast path
bunx --bun pikku scenario run local --spawn --run browser         # the same journeys, driven as a human
bunx --bun pikku scenario run local-admin --spawn --run browser   # the second app
```

`--spawn` starts and stops the server for the run; drop it if `bun run dev` is
already up. The browser pass needs the environment's `appUrl` and a browser
driver installed — without them the run fails fast rather than half-running.

**Run the whole suite, not the milestone's own scenarios.** The milestone's
scenarios are the ones you wrote to pass; the regression lives in someone
else's. Tightening what "archived" means is a one-function change that reads as
local and quietly breaks the milestone-01 scenario nobody re-ran.

**Restart the server after adding a function.** Hot reload does not register a
new RPC and does not re-run `afterStart`, so a fresh function answers 404 and
anything provisioned at boot is missing — failures that read like a wiring bug
and are nothing but a stale process.

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
- Sibling skills: `pikku-knowledge` (§2), `pikku-auth` (§3),
  `pikku-scenario` (§7, §7a), `pikku-deploy` and `pikku-fabric` (§9)
- Project conventions written by the template: `AGENTS.md`
- Doing less than this: `references/quick.md``. Doing more: `references/platform.md``.
