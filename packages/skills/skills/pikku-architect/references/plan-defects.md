# What makes a plan wrong

`plan set` catches the mechanical failures — a missing slot, a bad hash, a pass 1 with no `ui`
item. These are the ones it cannot, each carried back from a milestone that shipped it. They are
grouped by the question that finds them, and the fastest way to use this file is to read the six
questions and only open the group that worries you.

1. [Is this a plan for THIS note?](#is-this-a-plan-for-this-note)
2. [Does pass 1 slice, and does the model fit inside it?](#does-pass-1-slice-and-does-the-model-fit-inside-it)
3. [Can each scenario actually be performed?](#can-each-scenario-actually-be-performed)
4. [Does something produce every state and field the plan reads?](#does-something-produce-every-state-and-field-the-plan-reads)
5. [Can two sentences in the plan both be true?](#can-two-sentences-in-the-plan-both-be-true)
6. [Did you invent anything?](#did-you-invent-anything)

---

## Is this a plan for THIS note?

**Every entity the note names must appear in a function or a table.** The note is about
`entries`; the plan builds `projects`. Nothing downstream compares the two.

---

## Does pass 1 slice, and does the model fit inside it?

**Pass 1 is a slice, not a layer.** "Pass 1: the data model. Pass 2: the API. Pass 3: the
screens" is three passes of nothing working.

**Put in `model` only the tables pass 1 — or at worst pass 2 — actually migrates.** The model
slot has no passes: every item is checked from the moment the milestone starts, so a table whose
migration belongs to pass 3 is a PROBLEM from pass 1, and `plan progress` refuses on a problem
rather than deferring it. A milestone that finishes pass 1 green then cannot be closed, and every
fix is outside the build's hands. When a later pass needs its own tables, that is the signal it is
a second milestone — say so in `covers`.

---

## Can each scenario actually be performed?

**Ask which persona performs it. If the answer is "nobody", it belongs one level up or to no pass
at all.** The runner drives the app as the personas the project declares; there is no anonymous
RPC caller, so "a caller with no session is refused" is a sentence a backend or permission
scenario cannot perform. Signed-out is a BROWSER fact.

**Assert that the person got what they came for, not that the code ran.** A scenario proving
`saveEntry` returns 200 proves the wire. The one worth planning is the one where a person writes
something, comes back, and it is still there. A browser scenario that opens a page and asserts it
is still on it proves the route loads and nothing else — `plan progress` names it a problem and
refuses the milestone.

**Write summary and dashboard scenarios as deltas.** The suite runs against a live database nobody
resets, so "the payment-failed count is zero, then one" is a claim about every run that came
before. Read the figure, do the thing, assert what moved. And before planning a tile, name the
function in this plan that can move it: one counted uncaptured paid orders, which the checkout
function makes impossible to produce, so the scenario could only ever assert a zero.

**Every input the person is described as giving has to be a field somebody planned.** A plan wrote
"the desk lists what is due, and staff run the collection as of that date" while its screen only
ever asked about today — and deliveries fall on the first of a month, so the only thing that
scenario could assert was an empty desk. Read each scenario's prose against the `ui` items the
same way you read it against the functions.

**Write every refusal as "X, which is `<state>`, is refused because `<rule>`" — then check that
state against the rule you wrote in the same plan.** A refusal claims two things at once: that the
rule shuts, and that the described situation reaches the shut state. One plan asked for "a paused
licence is refused the academy" in the same milestone whose gate admitted `active_until_expired`,
which is exactly what pausing inside the paid period produces. The scenario could only ever have
asserted a bug.

---

## Does something produce every state and field the plan reads?

This is one question asked of four different things. Each costs a build a mid-flight design
decision that nothing records.

**Every clause of a `feature` or `scenario` description has to be performed by a function** — one
in this plan, or one already in the meta. Write "when the distributor is removed its companies
fall back to the direct catalog" with no function that removes a distributor and `plan set`
accepts it, `plan progress` passes, and the milestone ships a sentence nothing proves. Read each
description back asking *which function does this*, and cut the half you cannot name.

**Where a scenario calls the same function twice, check it for a per-period guard first.** A
one-per-day, one-per-order or one-per-person rule makes the second call a refusal, so the journey
cannot be performed in a single run however correct the code is. One planned "she finishes the
second lesson and is nudged about the third" against a function that refuses a second completion
the same calendar day.

**Every screen the milestone's opening paragraph names is either a `ui` item or a sentence to
cut.** This trap is easier to miss in the summary prose than in the scenarios: a screen named
there and carried by no `ui` item is invisible to `plan progress`, so the milestone closes green
with a sentence of itself unbuilt. One promised "the interval control on the admin product form"
for a form that does not exist anywhere in the app.

**Every field the plan filters, orders or badges on needs the function that sets it** — or a line
saying it is seed data, and why. A catalog planned to hide products by country, with no way to
mark a product's countries, cannot be proven without amending the plan mid-build.

**Every state a scenario waits in needs the function that leaves the world like that — checked
against the code ALREADY built.** Three failure shapes, in rising order of cost:

- *Stale*: a staff queue of "paid orders with no invoice yet", where an earlier milestone had
  moved invoicing to checkout. No order a customer could place was ever in that state; three
  scenarios passed once against old rows, then failed.
- *Unreachable*: staff asked to "capture the payment on an authorised order" when no function in
  the app or its addons could put an order in `authorized` — the addon only holds money when
  checkout was started with a flag the plan's own checkout input did not carry.
- *Wrong person*: a distributor salon owner planned to buy from a catalogue that is scoped by
  distributor and does not show her the product. Actors are not interchangeable.

**A `model` slot saying "this milestone adds no table" has to be true of the DATA the scenarios
read, not only of the entities they name.** One promised a checkout priced by delivery country — a
shipping rate per country, a VAT rate per country — against an `n/a` model, while the only shipping
table in the tree (an addon's) carries no country column at all. The builder then chooses between
altering someone else's table and amending the plan, with neither choice recorded. Wherever a
description prices, rates or tiers something BY a dimension, say in `model` where that lookup lives:
a table this milestone adds, a column on one that exists, or config-as-code — and if it is config,
say so and why, exactly as for seed data.

---

## Can two sentences in the plan both be true?

A plan is read one field at a time, so a contradiction between two descriptions survives every
check `plan set` makes and is discovered mid-build, with the code already written one of the two
ways.

**Where the milestone has a state machine — anything with more than two states and a clock — write
the transitions out once, in the model slot, as the table they are.** Every scenario description
then quotes that table instead of restating it from memory. One plan said a cancel on a paid-up
licence lands in `canceled` in one scenario and `active_until_expired` in the next.

**Then find every clock in that table: name who sets it, who reads it, and check that every rule
reading it agrees about when it starts.** The table itself is where the next contradiction hides.
The next plan wrote exactly this table and still shipped one — it re-stamped `paused_at` at the
moment a pause took effect, so "resume after four weeks paused" meant four weeks, but left
`canceled_at` at the moment the customer ASKED, as the legacy source does. A licence cancelled in
month one was, on the night its year ran out, already past both the 28-day chase and the 60-day
reactivation, and got both in the same sweep. One clock, two readings, in one table, on one screen.
When one clock in a family is deliberately diverged from its source, the sibling clocks are where
you look next: either the same reasoning applies to them, or the plan says why it does not.

**Wherever a function writes a set under a parent, say whether a save REPLACES that set or ADDS to
it.** A product's variants, an order's lines, a company's members: the two produce identical tables
and identical scenarios, and differ only on the second save. Left unsaid, one milestone shipped an
input schema that could not carry a variant's id, so every save re-added the variants it was given
to update — 1, 2, 4, 8, and by the nineteenth save 262,144 rows, with the suite green throughout.
Say it in the model slot in the same breath as `onDelete`: that field settles what happens when the
parent goes, this settles what happens when it stays.

---

## Did you invent anything?

**If the notes do not say who may do a thing, the answer is `null` with the reason, not a rule you
made up.** A rule the user never agreed to is one they find out about by being locked out of their
own app.
