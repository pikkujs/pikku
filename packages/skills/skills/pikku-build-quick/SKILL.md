---
name: pikku-build-quick
description: >-
  Build a working app on open-source Pikku fast — scaffold to running screens, skipping the
  knowledge base and the milestone ladder. For spikes, throwaway demos, and ideas nobody has
  committed to yet. TRIGGER when: the user asked for something quick, a prototype, a spike, a
  demo of an idea, or "just get it running", or picked "Quick" from the build-mode question. DO
  NOT TRIGGER when: the request is an unqualified "build me an X on Pikku" with no signal of
  speed or throwaway-ness — App is the default and small or toy-sounding apps do not change that
  (use pikku-build-app); the user wants a real product someone else will pick up (use
  pikku-build-app); the user wants a demo of Pikku itself — one that shows off surfaces like
  workflows, queues, realtime or i18n (use pikku-build-platform); or the user is adding a feature
  to an app that already exists rather than building one from a fresh scaffold (use
  pikku-feature).
---

# Build an app on Pikku, fast

You have a scaffolded project with skills installed. Get it to working, seeded,
signed-in screens in as few steps as possible.

**What this mode deliberately skips**, and what that costs:

| Skipped | Cost |
|---|---|
| `knowledge/` | Another agent — or you next week — cannot resume this. Nothing records *why*. |
| Milestone planning | No build order, no per-piece proof. Fine at this size, painful past it. |
| Design direction | It will look like the template. |
| Refusal scenarios | Access control is asserted, not proven. |

**Say this out loud to the user, once, when you finish.** A quick build that gets
mistaken for a real one is the only way this mode does damage. §6 is the way out.

## Agent Operating Procedure

1. Read `AGENTS.md` at the project root before your first screen — routing slots,
   `useNavItems()`, and the shipped component kit.
2. Keep generated files generated. Never hand-edit `.pikku/`, `*.gen.*`, or the SDK.
3. Run `pikku all` after touching functions, wirings or schemas. It is the gate,
   and its criticals are real.

## 1. One question, then build

Ask **one** thing, and only if the original request left it open: **who uses
it — one kind of person, or several?** Everything else you decide yourself.

- **One kind** — no roles to declare. The rule is ownership: you see yours, not
  theirs.
- **Several** — declare a role each in §2 and keep the count honest. An invented
  role becomes invented screens.

Do not ask about design, deployment, or scope. This is the quick mode; the
defaults are the point.

Do not ask about language either — take the defaults and note them in §6.
Identifiers are English in every project, whatever the product's market;
`metaLocale` in `pikku.config.json` (the language of `description`/`title`/step
`template`, which the Console renders) stays `en` unless the user already told
you otherwise. If the request says the app's UI is not English, that is the
message catalogue only: add the locale and set `defaultLocale`, and leave
`baseLocale` at `en`. `pikku-build-app` §1a has the three axes in full; getting
them confused is how a project ends up unable to add a second language.

## 2. Personas — 60 seconds, not optional

`packages/functions/src/personas.ts` ships with a `visitor`. Add one persona per
kind of person, plus **a second one of the primary kind** — that is what makes
"you see yours, not theirs" observable when you click around.

**One kind of person** — no `defineSystemRole` at all. Ownership is the only
rule, and it lives in each function's `permissions`, not in a role:

```typescript
import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'

definePersonas({
  visitor: { name: 'Visitor', jobTitle: 'Synthetic health-check user', account: {} },
  amina: { name: 'Amina', jobTitle: 'Gardener', account: {} },
  bilal: { name: 'Bilal', jobTitle: 'Gardener', account: {} },
})
```

**Several kinds** — one role each, and only for the kinds the user actually
named:

```typescript
import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'
import { defineSystemRole } from '#pikku'

defineSystemRole({
  owner: { displayName: 'Owner', description: 'Sees only their own rows', scopes: [] },
  tenant: { displayName: 'Tenant', description: 'Sees only their own tenancy', scopes: [] },
})

definePersonas({
  visitor: { name: 'Visitor', jobTitle: 'Synthetic health-check user', account: {} },
  amina: { name: 'Amina', jobTitle: 'Owner', roles: ['owner'], account: {} },
  bilal: { name: 'Bilal', jobTitle: 'Owner', roles: ['owner'], account: {} },
  chidi: { name: 'Chidi', jobTitle: 'Tenant', roles: ['tenant'], account: {} },
})
```

Two owners in both examples, deliberately: one owner cannot demonstrate that
owners are separated from each other.

- **Keep `visitor`.** The shipped scenarios name `actors.visitor`; removing it
  fails `pikku all` and nothing you write after that registers.
- **One `definePersonas` call for the whole project.**
- **Never write an email address** — each is derived from the persona id and
  `scenarios.emailDomain` in `pikku.config.json`.
- `roles` is typechecked against `defineSystemRole`; an undeclared role is a
  build error.

## 3. Build

Run `bunx --bun pikku bootstrap` once first. It wires the `#pikku` import alias
codegen depends on; without it your first `db migrate` fails with
`Cannot find package '#pikku'`.

Then, in this order — it is the order codegen depends on:

1. **Migration** — SQL in `db/sqlite/`, numbered on from what is there. Apply
   with `bunx --bun pikku db migrate`, which regenerates the Kysely types.
2. **Seed** — rows in `db/sqlite-dev-seed.sql`. There is no seed command:
   `bunx --bun pikku db reset` wipes, migrates and seeds in one go, and is the
   only thing that applies the file. It always starts from a wiped database, so
   the file is plain `INSERT`s — no `ON CONFLICT DO NOTHING`. It is local only:
   no deploy applies it, so anything the app cannot run without belongs in a
   migration instead. **Be generous, and
   seed rows for both personas.** An empty app demos badly, and you cannot see a
   layout break against zero rows.
3. **Functions** — one `pikkuFunc` per `*.function.ts`, `expose: true`. Pikku
   generates the typed RPC client and React Query hooks; you do NOT write HTTP
   routes. `wireHTTP` only for a real REST shape (a third-party webhook).
4. `bunx --bun pikku all`
5. **UI** — pages in `apps/app/src/pages/`, one route file each in
   `apps/app/src/routes/`, calling `usePikkuQuery` / `usePikkuMutation` from
   `@project/functions-sdk/pikku/api.gen`. Compose `@/components/<Name>` —
   `PageHeader`, `Panel`, `StatGrid`, `DataTable` — rather than hand-rolling.
   Register each screen in `useNavItems()`; that one file feeds the desktop
   sidebar and the phone navigation.

**Aim for two or three real entities and three screens** — a working surface, a
detail view, and somewhere to land. One table with a form on it is not an app,
and it is not faster to build.

Rules that stay non-negotiable even here, because breaking them costs more time
than they save:

- Input and output types come from `input:`/`output:` zod schemas. Never generic
  type params, never an inline return type. The schema is the type.
- Permission checks go in the `permissions` field, never the function body. An
  exposed function with no session and no permission is reachable by anyone over
  `POST /rpc/:rpcName` (PKU574).
- No `process.env` inside a function — use the injected `variables` / `secrets`
  services.
- A `z.date()` **input** arrives over RPC as an ISO string, not a `Date`.
  `new Date(value)` before calling date methods, or it throws
  `.getTime is not a function` at runtime.
- On SQLite, `db/annotations.ts` is where a `DATETIME` becomes a `Date` and a
  `JSON` column becomes a typed object. Without an entry they are `string` and
  `unknown` (PKU481). Add the annotation rather than casting.
- Surface errors inline next to the control that failed. No empty catch.
- Every user-facing string is a translation key, not a literal. It is one extra
  keystroke now and a rewrite later.
- Never hardcode a host or port — the API base resolves to same-origin `/api`.

Then run it:

```sh
bun run prebuild && bun run dev
```

API on :3000, app on the port vite prints. A frontend against a dead API looks
exactly like an app bug, so if every request fails, check both came up.

## 4. Look at it — actually

Sign up, click every screen. **HTTP 200 is not evidence:** pages are
client-rendered, so the server returns 200 with an empty shell and a page whose
component throws still looks fine to `curl`.

Looking is for the layout — the part only eyes catch. Assertions belong in the
smoke scenario, not in a browser session you steered by hand: that session proves
a screen rendered once, here, and nothing about it re-runs.

**Screenshot at 390px too.** A layout that is fine at 1440 routinely breaks on a
phone — an overflowing table, a row of buttons wrapped into a pile, a modal
taller than the viewport. It is the most likely width your demo gets opened at.

If you have five spare minutes, `npx impeccable install` (Node 22.18+) scores
each screen against interaction heuristics and names what is wrong. Feed it
screenshots, not source. It will polish the default look; it will not give the
app a look — that is `pikku-build-app` §8a.

## 5. One smoke scenario

Not the full ladder — one journey, end to end, as a real persona, so the app has
at least one thing that stays true.

```typescript
import { pikkuScenario } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const ownerCreatesAndSeesItScenario = pikkuScenario<void, { id: string }>({
  title: 'An owner creates a thing and sees it',
  tags: ['scenario', 'smoke'],
  func: async (_services, _data, { scenario, actors }) => {
    const row = await scenario.do('creates', 'createThing', { name: 'first' }, { actor: actors.amina })
    await scenario.then('sees it listed', 'thingShowsInList', { id: row.id }, { actor: actors.amina })
    return { id: row.id }
  },
})
```

- **`do` takes an RPC name; `given`/`when`/`then` take a declared
  `pikkuScenarioStep`.** An RPC name in a `then` will not resolve.
- **Every scenario must assert.** A ladder with no `then` is a PKU680 critical —
  it fails `pikku all`, stopping codegen rather than a test.
- **Add `SCENARIO_ACTOR_SECRET` to `.env`.** `bun run dev` writes that file with
  only a `BETTER_AUTH_SECRET`; without the actor secret
  `/api/auth/sign-in/actor` is disabled and every scenario fails at sign-in, for
  a reason that reads like an auth bug.
- **There is no state reset** — scope what you create to unique ids.

Keep the three shipped scenarios in `packages/functions/test/scenarios/` green.

```sh
bunx --bun pikku scenario run local --spawn
```

## 6. Hand it over honestly

Tell the user, in one short paragraph: what runs, what it is seeded with, and
that this is a quick build — no knowledge base, no milestones, no design pass,
access control clicked-through rather than proven.

**Upgrading to a real build is additive, not a rewrite.** If they want it, switch
to `pikku-build-app` and do this, in order:

1. Write `knowledge/` for what already exists — `entities/` for what you built,
   `decisions/` for what you chose silently, `questions/` for what you guessed
   at. Then `pikku knowledge index && pikku knowledge validate`.
2. Backfill a milestone note per screen you built, at `status: built`, each with
   its gherkin block.
3. Write the refusal scenarios — the ones proving one persona cannot reach
   another's rows. This is the gap that matters most.
4. Then pick up `pikku-build-app` at its §4 (apps) or §5 (milestones) for
   anything new.

Nothing built here has to be thrown away to do that — which is the whole reason
this mode is allowed to skip those steps in the first place.
