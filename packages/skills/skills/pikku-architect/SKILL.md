---
name: pikku-architect
description: >-
  Use to turn one settled milestone note into the technical plan the build is measured against —
  the tables, functions, wires, roles, scopes, screens and scenarios it owes, split into passes and
  written through `pikku knowledge plan set`. This is a SEPARATE SEAT from the build: the plan is
  the denominator `pikku knowledge plan progress` divides by, so whoever writes it must not be the
  one grading themselves against it. TRIGGER when: a milestone note is settled and the next step is
  planning it, the user asks to plan or architect a milestone, `pikku knowledge plan progress` says
  a milestone has no plan, or pikku-build's App mode reaches a milestone with nothing planned. DO
  NOT TRIGGER when: the milestone notes themselves are still being written (use pikku-knowledge),
  the plan already exists and the job is to build it (use pikku-build), or the ask is a one-off
  edit to a working app.
---

# Plan one milestone

A milestone note says what the app must DO and how it must feel for the person using it. It
deliberately does not say how. You are the seat that decides how, once, in writing, before anyone
builds it.

**Why this is a separate seat.** The build agent used to write its own plan. That makes one party
both author and examiner: it can build a fraction, plan only that fraction, and certify itself
complete — and `pikku knowledge plan progress` then divides by a denominator the builder chose
after seeing its own answer. A plan written here, against the note, by someone who is not going to
build it, is the denominator the builder does not own.

**One milestone, one plan, then stop.** Do not build in this session. Do not plan the next
milestone "while you are here" — the notes after this one are still allowed to change, and a plan
written against a note that later moves is worse than no plan.

---

## Write nothing by hand

The plan reaches disk through `pikku knowledge plan set <milestone> <file>` and nowhere else. It
validates first and names the field that is wrong if it refuses; a plan file written with an editor
is a plan nothing checked, and the place that discovers that is a finished build.

It is JSON rather than a note on purpose. Everything else under `knowledge/` is prose a human
reads; this one is consumed field-by-field, and a markdown parser is one more place a misspelt
heading silently passes. It cannot live INSIDE the milestone note either: that note is frozen once
its status leaves `proposed`, so rewriting it would change what the builder was told.

## Send it. Do not go looking.

```sh
pikku knowledge plan schema
```

That is the specification, in full, with every field's guidance in its `description`. There is no
second plan-format doc. So when you are unsure what a field wants, **write your best honest reading
and send it** — `plan set` validates every field and names the exact one that is wrong, so a wrong
guess costs one round trip and teaches you the answer.

The failure mode to recognise in yourself: you have decided the tables, the passes and the
functions, and you are still reading. That is the moment to run `plan set`.

---

## The turn

### 1. Read what has been settled

```sh
pikku knowledge validate          # the base is consistent before you plan against it
pikku meta context --json         # what the app already declares
pikku knowledge plan schema       # the only spec for what you are about to write
```

Then read, in the tree: the milestone's own note in full, every note it names on `entities:` and
`requires:`, the decisions that constrain it, and the migrations already in `db/sqlite/` — those
say whether your tables are new or an alter.

**Do not re-interview.** If the note leaves something genuinely undecided, plan the reading that
builds LESS. A smaller milestone that ships is worth more than a complete one that does not, and
what you leave out is named in `covers` for the next milestone to pick up.

### 2. Decide the passes

A pass is a slice of the milestone that stands up on its own. **Pass 1 is a walking skeleton**: it
reaches a real screen, with real functions behind it, proved by a real browser scenario. Everything
else waits behind it.

This is enforced, not advisory — `plan set` refuses a plan whose pass 1 has no `ui` item, no
`functions` item, or a pass-1 route with nothing proving it works. The reason is the failure it was
written against: a milestone that built four unwired functions and no page, and reported itself
finished. A build that runs out of time in pass 2 has shipped something; one that runs out of time
having built pass 1 across four half-finished layers has shipped nothing.

**Only pass 1 blocks.** `pikku knowledge plan progress` reports a later pass under `deferred` and
never refuses on it. That is what stops plan size from being fatal — but it is not licence to plan
a milestone nobody could finish. The question that decides a plan's size is not "what does this
note imply" but **"could a build finish all of this if pass 1 took twice as long as I expect"** — if
not, it is two milestones. Plan the first, and say in `covers` what you left behind.

**A screen is what pass 1 reaches only when the milestone IS an app.** The note's `surface:` says
which it is — absent means an app, and `cli`, `mcp`, `agent` and `backend` are the others. On those,
`ui` is legitimately `n/a` (with its reason, like any slot), and pass 1 proves itself one level
down: a pass-1 function that is actually wired, and a `scenarios.backend` item carrying that
function's name in its `fn` field. The obligation never lifts, it only moves — read the surface off
the note before you decide the passes.

### 3. Say what each slot is, or say why it is nothing

Every slot — `model`, `functions`, `roles`, `scopes`, `ui`, and each level of `scenarios` — is
either `{"kind": "built", "description": ..., "items": [...]}` or `{"kind": "n/a", "description":
...}`. **Both carry prose.**

There is no way to leave a slot out, and that is the point: "no roles, because everyone using this
app is the same kind of person" and "nobody thought about roles" must not look alike. Write the
`n/a` reason as a sentence a reader would accept, not as the word "none".

### 4. Write it

```sh
pikku knowledge plan set <milestone> /tmp/plan.json
```

Write the JSON to a file first — the command takes a path, not inline JSON, which is what keeps an
apostrophe in a `description` from ending a shell argument. If it is refused, the refusal names the
field path. Fix that field and send it again; do not restructure the plan around a refusal you have
not read.

Then confirm what the builder will be handed:

```sh
pikku knowledge plan show <milestone> --for-build
```

---

## What the plan holds

The plan holds INTENT. Reality lives in pikku's generated meta under `.pikku/`, which already
inventories every function, wire, scope, role, workflow, agent and scenario. Nothing here
duplicates that — only what codegen cannot infer: **why a thing exists, which pass it belongs to,
and which knowledge note it discharges.**

### `covers` — which notes this milestone discharges

Every plan claims at least one knowledge note: `note` (its path under `knowledge/`), `hash` (what
that note's body hashes to right now) and `complete`.

`complete: false` is the honest answer for a note whose claims span several milestones — claim the
whole of a note only when this milestone genuinely leaves nothing of it unbuilt, because a note
marked complete is a note nobody looks at again.

**You do not have to compute the hash.** Write anything twelve characters long and send the plan:
`plan set` refuses a hash that is not the note's current one and names the correct one, so one
round trip gets you every hash in the plan. That refusal is the point of the field — a hash that
was never right makes the note read as edited-since from the moment the milestone ships, and it
drops back into a backlog nobody planned.

### `model` — tables, and what their columns HOLD

Each field carries a `classification`: `public`, `internal`, `personal` or `sensitive`. That is what
lets a permission claim be checked against the data rather than only against itself — a function
returning a `personal` column with no permission rule is a defect the gate can name. It is also what
`db/annotations.ts` ends up expressing, so plan it here rather than discovering it at migrate time.

Each relationship carries `onDelete`: `cascade`, `restrict` or `orphan`. A foreign key states which
rows are related; it does not state what the product wants when the parent goes, and those three
produce identical schemas until someone deletes something. A `cascade` is checked against the
migrations by `plan progress`, and needs `provedBy` naming a scenario in this same plan that deletes
the parent and asserts the children are gone.

A table that already exists is altered by a NEW forward migration, numbered on from the ones in
`db/sqlite/`. Editing an applied migration is the hash mismatch that makes a deployed database
refuse to migrate, so plan the alter as its own file.

### `functions` — with their wire and their rule on them

The wire and the permission live ON the function, because that is where pikku enforces them. Two
parallel lists are two lists that drift.

**Do not give a function a `wire`.** pikku already serves every `expose: true` function as an RPC
and the client calls it by name, so for nearly every function there is nothing to decide — leave the
field out. A `wire` is for the exceptions: its own HTTP path via `wireHTTP` (a webhook, a payment
callback, a public URL another system posts to), a queue job, a channel, a scheduled task, or a
workflow entry point. Those last two are not alternate URLs — they are what the milestone IS, and a
plan that omits them ships a `status` column nothing advances or a job nobody runs.

`permission` is a SENTENCE, not a role name — "only the person who wrote it can edit it". The roles
are the engineer's choice; the rule is the part that has to survive being implemented, in the
function's `permissions` field and never in its body. `null` means open to anyone signed in, and
stating that is different from omitting it. **Every function with a permission rule needs a
permission scenario naming it in `fn`** — a rule with no failing case is a claim, not a check, and
`plan set` refuses the plan without one.

### `scopes` — what a KIND of user may do, never who owns a row

A scope depends ONLY on the session: "may this kind of user do this at all" — `admin:invoices:void`,
`billing`. It is declared with `wireScope` and granted in `mapSession`, so every name here has to
end up in pikku's generated scope meta. One that cannot be declared is one the build can never
finish, and `plan progress` refuses the milestone for as long as it stands.

Ownership is not a scope. "Only the owner of the house may read it" depends on the row being asked
for, and a scope never sees the row — that is the function's `permission` sentence and lives nowhere
else. If the rule mentions the record, it is a `permission`; if it reads the same for every row that
user touches, it is a scope. An app built from one person's idea usually has none at all, so
`{"kind": "n/a", ...}` is the ordinary answer here.

### `roles` — and the app each one signs into

The distinct `app` values across `roles` ARE the frontends this project gets, and nothing downstream
can recover the answer. Colleagues share ONE app and differ by nav and permitted actions (the
mechanic, the person on the counter, the bookkeeper); someone across the counter with an account
gets their own (the customer, the tenant, the patient). One app is a real answer and often the right
one — then every role carries the same slug. Never invent a person the notes do not name in order to
reach two, and never give a slug to someone who never signs in: a guest checking out takes the same
slug as the seller they buy from, on that app's public routes outside `/app`. Once there is more
than one app, every `ui` item carries its `app` too.

Adding the second frontend is the BUILD's job, at the milestone that first needs it —
pikku-build's multi-app reference. Your part is recording which app each person is in.

### `ui` — routes, and what is on them

One item per route, each with the pass that builds it. A pass-1 route has to be LINKED to the
scenario that proves it, and there are two ways: name the scenario in that `ui` item's own
`scenarios` array, or write a browser scenario whose `feature` contains the route path. Nothing else
counts — an unlinked browser scenario reads as a route nobody proved, and the plan is refused.

### `scenarios` — keyed by level

`backend`, `browser`, `permission`, each its own slot. Keyed rather than tagged so that a plan with
four backend scenarios and no browser scenario fails on its SHAPE — a flat list lets that through,
and that is exactly the milestone that builds an API and ships no screen.

**Every scenario needs `name`: the `pikkuScenario` export it becomes** (`saveEntryScenario`).
`feature` and `scenario` are prose for a reader, and prose cannot be matched against codegen.
`plan progress` looks for the export by that exact name, so a scenario with no name is one the gate
cannot see.

Permission scenarios default to pass 2 — they harden a journey that has to exist before they can
cover it — so a role × resource cross product there costs the milestone nothing.

---

## What makes a plan wrong

`plan set` catches the mechanical failures. These are the ones it cannot:

- **A plan for a different milestone.** The note is about `entries`; the plan builds `projects`.
  Every entity the note names must appear in a function or a table.
- **A pass 1 that is a layer, not a slice.** "Pass 1: the data model. Pass 2: the API. Pass 3: the
  screens." That is three passes of nothing working.
- **Scenarios that assert the code ran rather than that the person got what they came for.** A
  scenario proving `saveEntry` returns 200 proves the wire. The one worth planning is the one where
  a person writes something, comes back, and it is still there. A browser scenario that opens a page
  and asserts it is still on it proves the route loads and nothing else —
  `pikku knowledge plan progress` names it as a problem and refuses the milestone.
- **A refusal planned at a level that cannot state it.** A scenario runner drives the app as the
  personas the project declares; there is no anonymous RPC caller, so "a caller with no session is
  refused" is a sentence a backend or permission scenario cannot perform. Signed-out is a BROWSER
  fact — plan it as a browser scenario that opens the route signed out. Before writing a scenario's
  prose, ask which persona performs it; if the answer is "nobody", the claim belongs one level up or
  it belongs to no pass at all.
- **A permission rule invented here.** If the notes do not say who may do a thing, the answer is
  `null` with the reason, not a rule you made up. A rule the user never agreed to is one they find
  out about by being locked out of their own app.
- **Prose that promises what the plan cannot reach.** Every clause of a scenario's `feature` or
  `scenario` text has to be performed by a function — one in this plan, or one already in the meta.
  Write "when the distributor is removed its companies fall back to the direct catalog" with no
  function that removes a distributor, and `plan set` accepts it, `plan progress` passes, and the
  milestone ships a sentence nothing proves. Read each description back asking *which function does
  this*, and cut the half you cannot name. Naming the function is not enough on its own when the
  scenario asks it to run TWICE: a guard that is one-per-day, one-per-order or one-per-person makes
  the second call a refusal, and a scenario built on it cannot be performed in a single run however
  correct the code is. One milestone planned "she finishes the second lesson and is nudged about the
  third" against a function that refuses a second completion the same calendar day — discovered
  mid-build, with nothing to do but write the leg out. Wherever a scenario repeats a call, check the
  existing function for a per-period guard before you write the sentence.
- **A table planned into a later pass.** The model slot has no passes: a `model` item is checked
  from the moment the milestone starts, so a table whose migration belongs to pass 3 is a PROBLEM
  from pass 1 — and `plan progress` refuses a milestone on a problem, never defers one. So a
  milestone that finishes pass 1 green cannot be closed, and the only honest fixes are outside the
  build's hands. Put in `model` only the tables THIS milestone's pass 1 (or at worst its pass 2)
  actually migrates; when a later pass needs its own tables, that is the signal it is a second
  milestone, and `covers` is where you say so.
- **A field the plan reads and nothing writes — or a state nothing leaves behind.** If the plan
  filters, orders or badges on a column, name the function that sets it — or say it is seed data and
  why. A catalog planned to hide products by country, with no way to mark a product's countries, is
  a milestone that cannot be proven without amending the plan mid-build. Walk the model's fields and
  ask *who writes this* before sending the plan; that pass is cheap here and expensive later.

  The same question has to be asked of every state a scenario waits in, against the code that is
  ALREADY built. One milestone planned a staff queue of "paid orders with no invoice yet" and a
  journey through it; an earlier milestone had made the invoice at checkout, so no order a customer
  could place was ever in that state, and the queue could only ever hold rows from before that
  change. Three scenarios passed once against stale data and then failed. Read each precondition
  back asking *which function leaves the world like this*, and if the answer is "one that ran two
  milestones ago and no longer does", the journey is fiction — plan the one the app can actually
  reach.

  And a `model` slot that says "this milestone adds no table" has to be true of the DATA the
  scenarios read, not only of the entities they name. One here promised a checkout priced by
  delivery country — a shipping rate per country, a VAT rate per country — against an `n/a` model,
  while the only shipping table in the tree (an addon's) carries no country column at all. The
  builder is then choosing between altering someone else's table and amending the plan, mid-build,
  with neither choice recorded. Wherever a description prices, rates or tiers something BY a
  dimension, say in the `model` slot where that lookup lives: a table this milestone adds, a column
  on one that exists, or config-as-code — and if it is config, say so and why, exactly as you would
  for seed data.
- **Two sentences in the plan that cannot both be true.** A plan is read one
  field at a time, so a contradiction between two scenario descriptions survives
  every check `plan set` makes and is discovered by the builder, mid-build, with
  the code already written one of the two ways. One plan here said a cancel on a
  paid-up licence lands in `canceled` in one scenario and in `active_until_
  expired` in the next; the legacy state machine settled it, but only because
  the builder went and read it. Wherever the milestone has a STATE MACHINE —
  anything with more than two states and a clock — write the transitions out
  once, in the model slot, as the table they are, and let every scenario
  description quote that table instead of restating it from memory.

  Writing the table is not the end of it, because the table itself is where the
  next contradiction hides. **Every timestamp a rule counts FROM is a clock;
  find each clock, name who sets it and who reads it, and check that every rule
  reading it agrees about when it starts.** The next plan wrote exactly this
  table and still shipped one: it re-stamped `paused_at` at the moment a pause
  took effect (so that "resume after four weeks paused" meant four weeks) and
  left `canceled_at` at the moment the customer ASKED, as the legacy source
  does — and so a licence cancelled in month one was, on the night its year ran
  out, already past both the 28-day chase and the 60-day reactivation, and got
  both in the same sweep before anyone could post anything back. One clock, two
  readings, in one table, on one screen. When one clock in a family is
  deliberately diverged from the source, the sibling clocks are where you look
  next — either the same reasoning applies to them or the plan has to say why
  it does not.
- **A scenario that presupposes a control no `ui` item names.** A plan wrote
  "the desk lists what is due, and staff run the collection as of that date"
  while its screen only ever asked about today — and deliveries fall on the
  first of a month, so the only thing that scenario could have asserted was an
  empty desk. Read every scenario's prose back against the `ui` items the same
  way you read it against the functions: each input the person is described as
  giving has to be a field somebody planned.
- **A refusal scenario naming a state the plan's own rules do not refuse.** A
  plan asked for "a paused licence is refused the academy" in the same milestone
  whose gate admitted `active_until_expired` — and pausing inside the paid
  period is exactly what produces that state, so the scenario could only ever
  have asserted a bug. A refusal is a claim about TWO things at once: that the
  rule shuts, and that the described situation reaches the shut state. Write
  every refusal scenario as "X, which is <state>, is refused because <rule>", and
  check that state against the rule you wrote in the same plan.
- **A child collection whose save says nothing about the rows already there.** Wherever a function
  writes a set under a parent — a product's variants, an order's lines, a company's members — the
  plan has to say whether a save REPLACES that set or ADDS to it. The two produce identical tables
  and identical scenarios, and differ only on the second save. Left unsaid, one milestone shipped an
  input schema that could not carry a variant's id, so every save re-added the variants it was given
  to update: 1, 2, 4, 8, and by the nineteenth save 262,144 rows, with the suite green throughout.
  Say it in the model slot, in the same breath as `onDelete` — that field settles what happens when
  the parent goes, and this settles what happens when it stays.

---

## When you are done

The accepted `plan set` is the end of the seat. Hand the milestone to `pikku-build`, which reads the
plan with `plan show --for-build`, builds it, and closes the milestone only when
`pikku knowledge plan progress` is clean. What you wrote is what it is measured against.
