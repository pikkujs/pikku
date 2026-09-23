---
name: pikku-guide
description: >-
  Use when writing or regenerating a Pikku project's user guide — the end-user documentation
  built from the scenario suite with `pikku scenario guide`. A feature (pikkuFeature) is a page,
  its scenarios are sections, and the screenshots a passing `--screenshots` run filed are the
  figures; the command merges them into editorial markdown the project checks in. Covers the
  `<!-- pikku:guide feature=… -->` markers, the capture step, `.guide.lock` staleness,
  `document: false`, `--allow-undocumented`, `--artifact-base`, and the traps that make a guide
  come out empty or refused. TRIGGER when: user asks for a user guide, help pages, docs with
  screenshots, or "document the app". DO NOT TRIGGER when: user asks about API reference docs,
  README files, or writing the scenarios themselves (use pikku-scenario).
installGroups: [core]
---

# Pikku Guide

A guide is the scenario suite written out for the people who use the app. The
suite already knows what the product does — which features exist, what each
flow is called, what the screens look like at the moments that matter — so the
guide is compiled from it, not written a second time next to it.

Three inputs, one output:

| Input | Comes from | Owned by |
|---|---|---|
| Structure | `pikkuFeature` / `pikkuScenario` meta | the suite |
| Evidence | the latest passing run under `.pikku/scenario-runs/` — step sentences and screenshots | the run |
| Prose | markdown pages under `docs/` (or `--docs <dir>`) | a human, or you |

`pikku scenario guide` writes one markdown file per source page into
`.pikku/guide/` (or `--output`). It renders no HTML, resolves no asset URLs and
calls no model. Images are ordinary relative `![caption](path)` references into
the run directory; whoever hosts the markdown rewrites them, or you pass
`--artifact-base /docs/_media/` for a host that serves them at a fixed address.

Read **pikku-scenario** first if the project has no features or browser steps
yet — the guide cannot be better than the suite under it.

## 1. A page cites a feature

A page is a markdown file with frontmatter and a marker pair where the block
belongs:

```markdown
---
title: Booking a course
description: Finding a course, taking a place, and what happens after.
---

Courses run one evening a week for eight weeks. Start with Intro to Improv if
you have never done improv before.

<!-- pikku:guide feature=bookingsFeature -->
<!-- /pikku:guide -->

## Can I switch to another evening?

Email us before the second week and we will move you if there is a place.
```

- `feature=` is the **exported identifier id** of the `pikkuFeature`, not its
  display name.
- A rebuild rewrites only the region between the markers. Everything around
  them is yours and survives every run.
- One page may cite several features; one feature may be cited by several
  pages. The mapping is the union of every marker in the tree.
- Frontmatter the compiler does not own (`slug`, `sidebar_position`, `draft`)
  passes through untouched.

The generated block is each scenario's **title, the description its author
wrote, and the screenshots it filed** — never the Given/When/Then ladder. So the
`title` and `description` on `pikkuScenario` are user-facing copy: write them
for someone using the app ("Take a place on a course"), not for a test report
("mira books c-intro-1024 and sees remaining 4").

Organise pages by who reads them, not by feature: `docs/using/`,
`docs/teaching/`, `docs/organising/`. Use the project's own vocabulary, the one
on its screens — not internal table names.

## 2. Every feature is accounted for

Every registered feature must be cited by some page. An uncited feature fails
the command by name:

```
Feature 'barFeature' is cited by no page. Place `<!-- pikku:guide feature=barFeature -->` …
```

Two ways out, both deliberate:

- Write the page. This is the normal answer.
- The feature is plumbing nobody reads about (a session-health check, an
  internal sync): `pikkuFeature({ …, document: false })`. Citing a
  `document: false` feature is itself an error.

`--allow-undocumented` downgrades the uncited-feature error to a warning, for a
guide that is mid-way through being written. Do not hand one over with it on.

A page citing an id that is not a registered feature is always an error — it
describes something that no longer exists.

## 3. Screenshots come from a capture step

The run only files screenshots a step asks for. Add one browser step that opens
a page and takes a shot, and call it from a scenario each feature owns:

```ts
import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'

export const capturesScreen = pikkuScenarioStep({
  name: 'capturesScreen',
  description: 'captures the named screen',
  template: 'captures {name}',
  input: z.object({ path: z.string(), name: z.string() }),
  output: z.object({ captured: z.boolean() }),
  browser: async (_services, { path, name }, { browser }) => {
    await browser.goto(path)
    await browser.screenshot(name, { showcase: true })
    return { captured: true }
  },
})
```

- The screenshot `name` is the figure caption. Write it as a caption: "the
  course list, with places left on each ticket".
- `{ showcase: true }` marks a shot fit to publish outside the run. `{ fullPage:
  true }` photographs the whole scrollable page.
- Contexts open at a pinned 1440×900 viewport with animations off, so two runs
  photograph the same thing. Override with `E2E_VIEWPORT_WIDTH` /
  `E2E_VIEWPORT_HEIGHT` or the playwright config, or call
  `page.setViewportSize` inside the step for a phone-width shot.
- Prefer a shot at the end of a real flow step (after the booking succeeds) over
  a standalone "open and photograph" scenario — the figure then shows the state
  the section describes.

### Traps that make a block come out empty

- **A feature whose scenarios are RPC-only files no screenshot.** The command
  warns `whose run filed no screenshot — the block renders empty`. Fold that
  scenario into a feature that has browser coverage, or add a browser capture
  to it; do not invent a page just to photograph.
- **A capture loop must iterate a named const.** `for (const s of [ … ])` with
  an inline array literal cannot be extracted (PKU679) and the scenario becomes
  silently empty. `const screens = [ … ] as const` then `for (const s of screens)`.
- **A closing assertion runs wherever the last capture left the browser.**
  Captures appended to the end of a scenario move the page out from under a
  `then` that follows them. Capture after the last assertion, or re-navigate.
- **Locale.** Playwright reports `navigator.language` as `en-US`. An app that
  picks its locale from the browser renders English, and every copy assertion
  in another language fails. Set the app's own stored locale with
  `page.addInitScript` in **every** step that navigates, not only the first.

## 4. Build it

```sh
# 1. a full, passing browser run that writes the shots to disk
bunx --bun pikku scenario run local --run browser --screenshots

# 2. merge prose + evidence → .pikku/guide/
bunx --bun pikku scenario guide --docs docs
```

- `--screenshots` is what writes files. Without it `browser.screenshot()`
  still returns bytes and nothing lands on disk, so every block is empty.
- The run must have **passed**. A failed or killed run is refused — a page is a
  claim that the product does what it says.
- The run must be **the whole suite**. A run narrowed with `--flows`,
  `--features` or `--tags` is refused, because pages built from it would
  describe missing flows as though they did not exist. `--run-id <id>` picks an
  older full run.

## 5. `.guide.lock` — keeping prose honest

`docs/.guide.lock` records, per feature, a hash of its scenarios' **step
sentences and artifact ids** — deliberately not the image bytes. Restyling the
UI changes every screenshot and no sentence, so it does not stale a page.
Inserting, renaming or reordering a step changes what the prose around the
block was describing, and the page is reported:

```
docs/using/booking.md was written against 'bookingsFeature' at 3f1a…, which is now 9c0e… — the flow moved, so re-read the prose around that block.
```

Re-read that page's hand-written text, fix what the flow change made untrue,
and rebuild. The lock is rewritten on every successful build.

- **Commit the lock.** It is generated, never hand-edited, never hand-merged. A
  tree whose lock is untracked reports every page as current forever.
- The first build after adding pages prints stale warnings for every feature
  (there was no lock); they clear on the second build.

## 6. Hand-over checklist

- [ ] Every feature is cited, or declares `document: false` with a reason.
- [ ] No `--allow-undocumented` in the command you report as done.
- [ ] Built from a full, passing `--run browser --screenshots` run.
- [ ] No "block renders empty" warnings.
- [ ] No stale warnings left after the second build.
- [ ] `docs/` pages and `docs/.guide.lock` committed; `.pikku/guide/` is output.
- [ ] Scenario titles and descriptions read as user-facing copy.
- [ ] Open two generated pages and look at them: the figures are the screens the
      text describes, in the app's language.
