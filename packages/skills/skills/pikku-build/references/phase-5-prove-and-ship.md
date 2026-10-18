# Phase 5 — Prove it, make it look designed, ship it (§7-§9)

Part of the app workflow (`app.md` is the index and the rules that hold throughout). Building a changeset is §6-§6b, in `phase-4-build.md`.

## 7. Prove it — scenarios

A scenario is a user journey run as one of your virtual users, over the real
transport, with that virtual user's session. It is the only kind of test worth writing
here, because a passing one proves the app works the way a signed-in person
experiences it. Three ship in `packages/functions/test/scenarios/` — keep them
green — and every scenario a changeset's plan names becomes one more.

**Read the scenarios reference (see SKILL.md) before writing the changeset's scenarios,
and again whenever one of these describes what you are doing.** It is the file
where the expensive lessons live, and most of them produce a GREEN suite that
proves nothing:

- the shape of a scenario, and `do` vs `given`/`when`/`then`
- what survives DSL extraction — a `then` in `return` position asserts nothing,
  and a shared setup helper credits its steps to the wrong virtual user
- what to assert — refusals must read the REASON, totals must be deltas, and the
  assertion nobody writes is the row count
- living without a state reset: the suite must be green on its SECOND run
- how a shared step rots as later changesets add writers of the rows it selects
- browser specifics — the click/navigate race, testids, and `Outlet` nesting

Run them:

```sh
bunx --bun pikku scenario run local --spawn                  # server-side, the fast path
bunx --bun pikku scenario run local --spawn --run browser    # the same journeys, driven as a human
```

In a multi-app project that one run covers both frontends: each virtual user carries
its own `app` and `@pikku/playwright` resolves the base url from the
environment's `appUrls` map, so there is no second environment to run.

**Run the whole suite, not the changeset's own scenarios.** The changeset's
scenarios are the ones you wrote to pass; the regression lives in someone
else's. Tightening what "archived" means is a one-function change that reads as
local and quietly breaks the first changeset's scenario nobody re-ran.

**Restart the server after adding a function, and never edit one while a run is
in flight.** Hot reload does not register a new RPC and does not re-run
`afterStart`, so a fresh function answers 404 and anything provisioned at boot
is missing — failures that read like a wiring bug and are nothing but a stale
process. The same reload is what makes a run unrepeatable if you edit during
it: a browser pass is long enough to feel like free time, and a schema touched
at minute four hot-reloads into a half-generated contract, so every scenario
after that point fails on something you have already fixed. Wait for the run or
kill it — a run you edited under is not a result.

### 7a. Coverage — which functions have actually been run

Run it as each changeset closes, read `coverage/scenario-coverage.json`, and report the number when you hand
the changeset over. The scenarios reference (see SKILL.md), "Coverage", has the commands and how to tell a
missing scenario from a function that should not exist from a real deferral.

## 8. Make it look like someone designed it

**This section numbers 8, but half of it has already happened.** Read
the design reference (see SKILL.md) before the first screen is built — a design pass run on
eight changesets of scaffolded screens is a repaint, and it shows. What is left
here at §8 is the theme you may have deferred and the critique you cannot run
until there are screens to critique.

Three separate jobs, and conflating them is why open-source builds come out
looking like the template:

- **Direction** — deciding what it should look like. **No open-source tool does
  this.** A hosting platform may offer one; you have §1's answer and 8a below.
- **Execution** — whether the screens actually realise that direction, or
  default to whatever component was nearest. No theme does this, and it is where
  "works but looks like nobody decided anything" comes from.
  the design reference (see SKILL.md) carries the process for it, and it belongs at §6, per
  screen.
- **Critique** — judging how well the built screens execute the direction.
  `impeccable` does this well, and it is free.

Impeccable audits the design you chose. It will never tell you the app should
have looked like something else — it will happily award a clean bill of health to
a perfectly-executed default. Skip the first two and you ship Neutral with good
spacing.

### 8a. Author the theme — the step nothing does for you

The look lives in `packages/theme` as data. **Read the theming reference (see SKILL.md)**: the file layout, what
each field changes, turning a direction in words into a theme, setting the theme once instead of hardcoding
colours, sharing it across apps (vary the register, not the palette), and writing the direction into
`knowledge/decisions/design/`.

### 8b. Compose real components, then critique

**The design reference (see SKILL.md) is where design actually lives** — committing to a
direction before the first screen, judging the result from screenshots rather
than from source, the two screens that get skipped, and why you reset the dev
database before judging anything. It prescribes no layouts on purpose: two apps
built from this skill should not look like each other. What follows here is only
the component inventory.

**Compose with rich components — not tables and text everywhere:**

- **shadcn `chart`** (Recharts underneath, coloured by `--chart-1` to `--chart-5`) for overviews — area,
  bar, line and pie charts. A metric worth showing is
  worth a chart, not a number in a paragraph.
- **shadcn `calendar` and `date-picker`** for anything time-based, including
  range inputs. Never hand-roll a date field.
- Composed layouts over flat lists — a timeline for history, steps for
  multi-step progress, `Card` + a CSS grid for a gallery, `Progress` for
  completion, `Badge` for status.

Add each one with the shadcn CLI and use the real component.

Then critique it. Free, and works across coding agents:

```sh
npx impeccable install     # current releases need Node 22.18+
```

Impeccable scores a screen against interaction heuristics and names what is
wrong: hierarchy, spacing, type registers, states you forgot. Run it on **every**
screen in **every** app, fix what it finds, and re-run the ones you changed.

Screenshots (desktop and ~390px), feeding them to impeccable, and resetting the dev database before you judge
are in the design reference (see SKILL.md), "Judge it" and "Facts, not taste". The template already mounts a
phone navigation per `AGENTS.md` — pick `MobileTabBar` or `MobileNavDrawer` deliberately per app, never both.

The gate: **no P0 findings left on any screen, in any app, at either width**,
and every screen honestly answers the questions in the design reference —
including whether it looks like the direction you committed to or like the
components you had. Don't silence a finding by deleting the feature it is
about.

## 9. Ship it, and stay deploy-ready

When the queue is empty, `pikku knowledge gaps` lists nothing and the scenarios are green, read
the ship reference (see SKILL.md). It carries the open-source deploy paths (`--provider
standalone`, `cloudflare`, `aws`), how to serve several frontends behind one
API, the pre-release gate to run, and the contract that keeps the project
importable by a hosting platform later rather than a migration.

The app is not handed over without its user guide. The scenarios you wrote are
already its skeleton: read **pikku-guide**, write one page per audience citing
every feature, and build it from a full, passing `--run browser --screenshots`
run.

The deploy-readiness contract in that reference (no hardcoded host, port or `process.env` in a function; generated
files stay generated) is cheaper to honour while building than to retrofit.
