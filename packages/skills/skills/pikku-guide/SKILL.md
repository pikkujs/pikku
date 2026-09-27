---
name: pikku-guide
description: >-
  Use when writing or regenerating a Pikku project's user guide — the end-user documentation
  built from the scenario suite with `pikku scenario guide`. Pages are hand-written markdown that
  cite features (pikkuFeature); the recordings and screenshots a passing `--screenshots` run
  filed for each cited feature are merged in as figures. Covers writing the prose, the
  `<!-- pikku:guide feature=… -->` markers, the capture step, `.guide.lock` staleness,
  `document: false`, `--allow-undocumented`, `--artifact-base`, and the traps that make a guide
  come out empty or refused. TRIGGER when: user asks for a user guide, help pages, docs with
  screenshots, or "document the app". DO NOT TRIGGER when: user asks about API reference docs,
  README files, or writing the scenarios themselves (use pikku-scenario).
installGroups: [core]
---

# Pikku Guide

A guide is the app explained to the people who use it, with the scenario suite
as its evidence. The suite proves what the product does and photographs it
doing it; the pages say what that means for the reader and how to do it.

Three inputs, one output:

| Input | Comes from | Owned by |
|---|---|---|
| Structure | `pikkuFeature` meta — which features exist, and that every one is cited | the suite |
| Evidence | the latest passing run under `.pikku/scenario-runs/` — recordings and screenshots | the run |
| Prose | markdown pages under `docs/` (or `--docs <dir>`) — **every word the reader reads** | a human, or you |

**The run contributes pictures, never words.** Step sentences, scenario
descriptions and feature names are written to prove a test, and none of them
reaches the page. A page that is a two-line intro and a marker publishes as a
wall of videos with no instructions — the most common way a guide comes out
bad. The writing in §2 is the job; the rest of this skill is plumbing.

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

Courses run one evening a week for eight weeks. Book when you know which
evening suits you; Intro to Improv is the place to start if you have never
done improv before.

1. Open **Courses**. Each course shows its evening and how many places are left.
2. Choose a course, then **Book a place**.
3. Confirm your details and choose **Book**.

Your place appears under **My bookings**, and a confirmation email follows.

<!-- pikku:guide feature=bookingsFeature -->
<!-- /pikku:guide -->

## The course says it is full

A full course keeps a waiting list. Choose **Join the waiting list** and we
email you the moment a place frees up — you are not charged until then.

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

The generated block is the feature's **figures and nothing else**: for each
scenario, its recordings first (one per actor), then its screenshots, deduped
across data-driven rows. Two strings from the suite do reach the page, as
captions:

| Figure | Caption |
|---|---|
| Recording | the scenario's `title`, then ` — ` and the actor's name |
| Screenshot | the `name` it was taken under |

So those two are user-facing copy: "Take a place on a course", "the course list,
with places left on each ticket" — not "mira books c-intro-1024" or
"courses /app/courses at 1440px". The scenario `description` and the steps are
never rendered.

A block is indivisible: all of a feature's figures land together, where the
marker sits. Place the marker after the steps it illustrates, not before them.
If one page needs figures beside two separate steps, those steps are two
features.

Organise pages by who reads them, not by feature: `docs/using/`,
`docs/teaching/`, `docs/organising/`. Use the project's own vocabulary, the one
on its screens — not internal table names.

## 2. Writing the page

Write it so a reader can do the task **with every figure removed**. The figures
confirm; they do not instruct. A reader skims for the step they are stuck on,
and cannot search a video.

Before writing, read the screen's component and its copy, then the feature's
scenarios. The screen is what renders; the scenario is what is proven, and its
steps are the user's journey already in order. Write only what you have seen
in one of them — a fluent page describing a flow that does not exist is worse
than no page.

Each task page carries, in the reader's language (the app's, not English by
default):

- **Why and when** — one short paragraph: what this is for, and when the reader
  would reach for it. Never "This page documents…".
- **The steps** — a numbered list, each one an action in the words on the
  screen: "Open **Patienten** and choose **Patient anlegen**." Name buttons and
  fields exactly as they read.
- **What you see afterwards** — the state that means it worked.
- **What goes wrong** — the refusal, the empty state, the thing that looks
  broken but is not. Every empty state a scenario lands in and every
  `expectError` in the feature is a candidate; this is usually the paragraph
  readers came for.
- **Where next** — links to the pages a reader goes to from here.

Then the marker, after the steps it shows.

A page that exists only to cite a feature — "every page loads", "acceptance",
a smoke suite — is not a page. Cite that feature from the page whose screens it
covers, or mark it `document: false`.

Reassurance is content: "Codes held in reserve cost nothing until a patient
uses one" is what stops a reader hesitating over the button. Explain the
confusing thing, not the impressive one.

## 3. Every feature is accounted for

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

## 4. Screenshots come from a capture step

The run only files screenshots a step asks for. Add one browser step that opens
a page and takes a shot, and call it from a scenario each feature owns:

```ts snippet:guideCaptureStep
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

## 5. Build it

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
  `--features`, `--tags` or `--exclude-tags` is refused, because pages built
  from it would describe missing flows as though they did not exist. An
  exclusion that matches nothing still counts — keep every narrowing flag out
  of a CI invocation whose run feeds the guide. `--run-id <id>` picks an older
  full run.

## 6. `.guide.lock` — keeping prose honest

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

## 7. Hand-over checklist

- [ ] Every feature is cited, or declares `document: false` with a reason.
- [ ] No `--allow-undocumented` in the command you report as done.
- [ ] Built from a full, passing `--run browser --screenshots` run.
- [ ] No "block renders empty" warnings.
- [ ] No stale warnings left after the second build.
- [ ] `docs/` pages and `docs/.guide.lock` committed; `.pikku/guide/` is output.
- [ ] Every page reads as instructions with its figures removed: why and when,
      numbered steps naming the controls as they read on screen, what goes
      wrong.
- [ ] No page exists only to cite a smoke or acceptance feature.
- [ ] Scenario titles and screenshot names read as captions — no routes,
      viewport sizes or test ids.
- [ ] Open two generated pages and look at them: the figures are the screens the
      text describes, in the app's language.
