# Scenarios — writing journeys that stay proven

A scenario is a user journey run as one of your personas, over the real transport, with that
persona's session. It is the only kind of test worth writing here, because a passing one proves the
app works the way a signed-in person experiences it.

The traps below all cost a real milestone a red run, and most of them are invisible on the run that
introduces them. Read the section that matches what you are writing.

1. [The shape of a scenario](#the-shape-of-a-scenario)
2. [Extraction: what survives, and what silently does not](#extraction-what-survives-and-what-silently-does-not)
3. [What to assert](#what-to-assert)
4. [There is no state reset](#there-is-no-state-reset)
5. [Steps rot as the app grows](#steps-rot-as-the-app-grows)
6. [Browser scenarios](#browser-scenarios)
7. [Running them](#running-them)
8. [Coverage — which functions have actually been run](#coverage--which-functions-have-actually-been-run)

---

## The shape of a scenario

Three ship in `packages/functions/test/scenarios/` — keep them green — and every milestone's gherkin
block from §5 becomes one more.

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

**`do` takes an RPC name; `given`/`when`/`then` take a declared step.** A step is a
`pikkuScenarioStep` that says what a person is doing and holds one implementation per surface
(server-side by default, plus a `browser` one that drives the page). Reaching for an RPC name in a
`then` will not resolve.

**Add `SCENARIO_ACTOR_SECRET` to `.env`.** `bun run dev` generates that file with a
`BETTER_AUTH_SECRET` and nothing else, and without the actor secret `/api/auth/sign-in/actor` is
disabled — every scenario then fails at sign-in, before its first step, for a reason that reads like
an auth bug.

---

## Extraction: what survives, and what silently does not

A scenario body is extracted as a DSL workflow, so it is not ordinary TypeScript. The failures here
are the expensive kind: two of the three produce a GREEN suite that proves the wrong thing.

**Every scenario must assert, and `return await scenario.then(...)` does not count.** A ladder of
`given`/`when` with no `then` is a PKU680 critical — it fails `pikku all`, so it stops codegen
rather than a test. Coverage counts every step, so without that rule an assertion-free ladder of
clicks would score a perfect run while checking nothing. The extractor reads the body statically and
does not see a `then` in `return` position: seven refusal scenarios here, each ending
`return await scenario.then('is refused …', …)`, were all reported as never asserting. Bind it —
`const asserted = await scenario.then(...)`, then `return asserted` on the next line — which is also
how the value stays inspectable when the step's output is what the scenario returns.

**Only `const`/`let`, `if`/`else`, `switch`, `for..of`, `return`, `throw` and workflow calls
survive.** A counting `for` is refused by PKU679, and so is a `for..of` whose iterable is written
inline — it must be a named identifier or a field (`data.items`). Bind the seat numbers, the ids,
the rows to a `const` above the loop and iterate that. One milestone here lost a codegen round to
each half of that rule, because the first half does not imply the second.

**Write each scenario's setup out in full rather than sharing a local helper.** A helper holding
setup steps does not fail extraction — the steps are recorded and the suite goes green — but the
extractor cannot bind an `actor` that arrives as a function parameter, so the transcript credits
every setup step to whoever the last literal binding named. Seven permission scenarios here read
"henrik sets up her company Salon Nordlicht" in a suite whose whole point was that the company is
finja's. A scenario body is a recorded document, and the duplication is the price of it saying who
did what.

---

## What to assert

**Write the refusals, and assert WHY.** One persona reaching for another's row has to be rejected,
and that rejection is a scenario — it is how you prove access control instead of asserting it. But
only if the step reads the reason: "not ok" is also what a malformed request returns, so a refusal
step that stops at the status code passes on a call the function never even ran. One here posted
straight to `/rpc/<name>` with the function's input as the body; that route validates an ENVELOPE
(`{ rpcName, data }`), so the input read as a bag of unknown properties and came back 422. Asserting
the refusal MENTIONED the rule — a company, an owner, a scope — turned a green false positive into a
one-line fix.

**Assert totals as deltas.** A screen that counts or sums every row — a revenue tile, a queue count,
a dashboard — is reporting the whole history of a database nobody resets. Read the summary before
the journey, read it after, and assert what the journey moved. An absolute ("the failed count is
zero") is a claim about every run that came before. And when a tile turns out to be one no journey
in the app can move at all, that is a finding about the app, not an assertion to force: assert it
held still, say why in the step's doc comment, and tell the user.

**Green twice is not the same as unchanged twice — count the rows.** A save that appends where it
should replace passes every assertion while doubling a table. One here re-sent a product's variants
without their ids, so the addon read each as new: 1, 2, 4, 8, and by the nineteenth save 262,144
rows, every run green until the request crossed a body-size limit and surfaced as a `413` that read
like an infrastructure fault. The assertion nobody writes is the count, and it is one SQL query.

**One screen's extra field does not belong on the shared output schema.** A detail page almost
always wants one column the list does not — when the licence was handed over, who last touched the
row. Extending the shared `XDetail` that four functions already return bumps the contract of all
four, for a field three of them never render. Extend at the new function's own output instead —
`XDetail.extend({ assignedAt })`, named for the screen that asked. Say in the new type's doc comment
WHY it is not on the base, or the next build merges them back.

---

## There is no state reset

A scenario runs against a live server: scope what you create to your own rows and unique ids, and
never assume a clean database. A scenario that leaves durable state changed has to put it back — the
one that archives a product unarchives it, the one that cancels a plan restarts it — because its own
second run starts where its first one stopped.

**Run the suite twice and require the second run green.** A suite that only passes on a fresh
database is a suite that passes once. Two corollaries, both of which cost a milestone a red run:

- **Name nothing a setup step might already own.** `setsUpHerCompany` returns the company that actor
  already has rather than renaming it, so a later step passed the literal name it had asked for and
  was told no such company exists. Read the name, slug or id back off the step's output and pass
  THAT.
- **Put rows somewhere the other scenarios are not.** An import seeded at the same coordinates as
  another scenario's salons accumulated one row per run until it crowded that scenario's own salon
  out of a nearest-N list. Anything a scenario asserts by proximity, recency or a top-N cut is
  asserting against every row every previous run left behind.

**Moving the clock forward runs every rule between here and there.** A step that time-travels so a
scheduled job will fire is not asking for that job — it is asking for all of them, in order. One
swept to 2030 to reach a four-week chase and found the pile it was about to assert on empty, because
an unreturned pen reactivates a membership sixty days after cancellation and the sweep had walked
straight past that window. Travel to the day the rule under test fires and no further, computed off
a date the scenario read back (`daysAfter(periodEnd, 1)`), never to a round far-future date — and
when a sweep surprises you, the next rule in the calendar is the first place to look.

---

## Steps rot as the app grows

A step is shared, so it is the one thing in the suite that a milestone which never mentions it can
break. Whatever a step selects by, ask what ELSE will match it after the suite has run a hundred
times.

**Drive a new step from both sides in the milestone that adds it.** A step is only as proven as its
best-exercised branch: one here read the wrong field off a raw invocation (`attempt.data`; the
payload is `attempt.body`), so its found-case could never pass — invisible for as long as every
caller asked for ABSENCE.

**When you add a writer of a row an existing step selects by recency, give that step an explicit
filter in the same change.** "The newest X" stops meaning "the one this scenario just made" the
moment a second function produces X: a renewal job that raised invoices broke three invoice
scenarios that had been green for months.

**A selector on IDENTITY alone rots the same way once rows gain a lifecycle.** One reused the first
licence assigned to an email regardless of its state, which was correct until a new milestone's
refusal scenarios left that actor holding cancelled ones — it then handed back a dead licence, read
as success, and failed a scenario two milestones older at a step that needed a live one.

**A step's input is a recorded contract, and it does not take a version.** Widening one — an extra
optional field so a step can name a particular row — trips PKU861 exactly like a function's does,
but the fix that works for a function does not work here: adding `version: 2` to a
`pikkuScenarioStep` makes the runner unable to find the step at all, and every scenario using it
fails with `Function not found`. Add a NEW step beside the old one. That is the better answer
anyway, because a step that has grown an optional field is usually two questions wearing one name —
"does she have an invoice like this" and "what became of the invoice I am holding" — and the
scenarios read better once they say which one they are asking.

---

## Browser scenarios

**A click returns before its effect lands — assert the effect, then navigate.** A browser step's
click resolves when the button was pressed, not when the mutation it fired came back. So a step that
presses "Add to cart" and the next one that opens `/app/cart` are in a race with the `onSuccess`
that writes the cart token to `localStorage`, and the loser arrives at an empty basket. It passed on
the first run here and failed on the second, which is the worst way to find out. Put an assertion on
the confirmation between them — the button's own "Added", the toast, the row that appeared — so the
navigation waits on the write instead of on luck. This is also why a browser scenario that is only
clicks reads better than it tests: every `when` that writes wants a `then` before the next page.

**A control the browser cannot NAME is a control it cannot drive.** A testid is derived from a
message key at build time, which has two consequences that only show up when a scenario tries to
press something:

- A label chosen at runtime — `label={isCancel ? m.a() : m.b()}` — derives no key at all, so the
  field is unreachable and the failure reads as a missing element rather than a conditional. Write
  the two controls out separately, each with its own static call.
- Every row of a list carries the SAME keys, so `pause` on a list of twelve licenses is twelve
  matches and a strict-mode violation. Scoping by text does not save it either, because a button's
  own text is "Pause" and not the row's. Give the row an address of its own —
  `data-testid={id.slice(0, 8)}` on the card, rendered beside the title so a person can read it too
  — and address the control `within` it.

Both are screen defects before they are test defects: a field whose label changes identity under it,
and a list whose rows are indistinguishable to anyone on the phone to support.

**A route nested under an existing screen is unreachable until its parent renders an `Outlet`.** A
milestone added `/app/academy/$slug` under an `/app/academy` that already had a component of its
own; the parent swallowed the child, so the editor's URL rendered the list — every link, every route
file and every type check looked right, and the only thing that noticed was a browser scenario that
OPENED the child path and found the parent's controls on screen. When a milestone deepens a path an
earlier one already owns, split the parent into a layout (`Outlet`) and an `index` route in the same
change, and make one scenario open the child by path rather than reach it by clicking.

**Never hard-code the target's origin.** A raw-HTTP step — a webhook, a check-in a scanner posts —
runs in the CLI process, not on the server, so it has to be told where to post. That is
`wire.scenarioStep.env.apiUrl`, which carries the environment and whatever `--api-url` overrode it.
A literal `http://localhost:3000` does not merely break on another port: it silently posts into
whatever else is listening there, so the scenario goes green having never touched this app at all.

---

## Running them

```sh
bunx --bun pikku scenario run local --spawn                       # server-side, the fast path
bunx --bun pikku scenario run local --spawn --run browser         # the same journeys, driven as a human
bunx --bun pikku scenario run local-admin --spawn --run browser   # the second app
```

`--spawn` starts and stops the server for the run; drop it if `bun run dev` is already up. The
browser pass needs the environment's `appUrl` and a browser driver installed — without them the run
fails fast rather than half-running.

**Run the whole suite, not the milestone's own scenarios.** The milestone's scenarios are the ones
you wrote to pass; the regression lives in someone else's. Tightening what "archived" means is a
one-function change that reads as local and quietly breaks the milestone-01 scenario nobody re-ran.

**Restart the server after adding a function.** Hot reload does not register a new RPC and does not
re-run `afterStart`, so a fresh function answers 404 and anything provisioned at boot is missing —
failures that read like a wiring bug and are nothing but a stale process.

---

## Coverage — which functions have actually been run

Green scenarios tell you the journeys you wrote still work. They say nothing about the code you
never wrote a journey for, and that gap is invisible without measuring it:

```sh
bunx --bun pikku dev --coverage                        # server, instrumented
bunx --bun pikku scenario run local --coverage         # against that server
```

That writes `coverage/scenario-coverage.json` — which functions each journey exercised. **A function
no scenario touches has never been run by anything but you, by hand, once.** It compiles, it
typechecks, `pikku all` is happy, and nobody has proven it does what it says.

Run it **as each milestone closes**, not once at the end. Coverage read per milestone is a short
list you can act on — the milestone you just built either covered its own functions or it did not.
Read for the first time after ten milestones it is a wall of red that nobody triages, and the honest
response to a wall of red is to ignore it.

Every gap is one of three things, and naming which is the point of looking:

- **A missing scenario** — the function matters and no journey reaches it. Write the journey.
  Refusal paths dominate this category, because it is the case you are least likely to have clicked
  through by hand.
- **A function that should not exist** — nothing reaches it because nothing needs it. Delete it. An
  unused exposed function is also reachable over `POST /rpc/:rpcName`, so this is a security finding,
  not only dead weight.
- **Genuinely deferred** — real, not yet reachable from the UI. Say so in the milestone note that
  will cover it, so the gap is a decision rather than a hole.

Report the number when you hand the milestone over. A number nobody says out loud is a number nobody
acts on.
