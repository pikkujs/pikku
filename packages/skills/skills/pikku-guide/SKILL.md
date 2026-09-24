---
name: pikku-guide
description: >-
  Use when writing, rewriting or regenerating a Pikku project's user guide — the end-user
  documentation built from the scenario suite with `pikku scenario guide`. Pages are hand-written
  markdown, one section per task, each followed by a `<!-- pikku:guide feature=… scenario=… -->`
  marker that pulls in the screenshot and recording that scenario filed. Covers planning pages
  from the suite, writing task prose in the app's language, per-section markers, the capture step,
  seed data that appears on camera, `.guide.lock` staleness, `document: false`, and the traps that
  make a guide come out empty, refused, or as a wall of videos. TRIGGER when: user asks for a user
  guide, help pages, docs with screenshots, "document the app", or complains that the /docs pages
  are bad, thin, or all videos. DO NOT TRIGGER when: user asks about API reference docs, README
  files, or writing the scenarios themselves (use pikku-scenario).
installGroups: [core]
---

# Pikku Guide

A guide is the app explained to the people who use it, with the scenario suite
as its evidence. The suite proves what the product does and photographs it
doing it; the pages say what that means for the reader and how to do it.

| Input | Comes from | Owned by |
|---|---|---|
| Structure | `pikkuFeature` meta — which features exist, and that every one is cited | the suite |
| Evidence | the latest passing run under `.pikku/scenario-runs/` — recordings and screenshots | the run |
| Prose | markdown pages under `docs/` (or `--docs <dir>`) — **every word the reader reads** | you |

**The run contributes pictures, never words.** Step sentences, scenario
descriptions and feature names are written to prove a test; none of them
reaches the page. The two ways a guide comes out bad are both about that
split: pages that lean on the figures to explain (a two-line intro and a
marker — a wall of videos with no instructions), and figures that are not
beside the words they illustrate (every recording piled at the foot of the
page). This skill is mostly about avoiding those two.

`pikku scenario guide` writes one markdown file per source page into
`.pikku/guide/` (or `--output`). It renders no HTML, resolves no asset URLs and
calls no model. Figures are ordinary relative `![caption](path)` references into
the run directory; the host rewrites them, or pass `--artifact-base /docs/_media/`.

Read **pikku-scenario** first if the project has no features or browser steps
yet — the guide cannot be better than the suite under it.

## 1. What a good page looks like

One page per job a reader comes to do; one section per task in that job. Each
section is the instructions, then the marker for the one scenario that shows
it:

```markdown
---
title: Booking a course
description: Finding a course, taking a place, and what to do when it is full.
---

Courses run one evening a week for eight weeks. Book when you know which
evening suits you; Intro to Improv is the place to start if you have never
done improv before.

## Book a place

1. Open **Courses**. Each course shows its evening and how many places are left.
2. Choose a course, then **Book a place**.
3. Confirm your details and choose **Book**.

Your place appears under **My bookings**, and a confirmation email follows.

<!-- pikku:guide feature=bookingsFeature scenario=memberBooksPlaceScenario -->
<!-- /pikku:guide -->

## The course is full

A full course keeps a waiting list. Choose **Join the waiting list** and we
email you the moment a place frees up — you are not charged until then.

<!-- pikku:guide feature=bookingsFeature scenario=memberJoinsWaitingListScenario -->
<!-- /pikku:guide -->

## Where next

- [Paying for a course](payments.md)
```

The generated block holds that scenario's figures and nothing else: its
showcase screenshots first, then its recording, then its other screenshots.

- `feature=` and `scenario=` are **exported identifiers**, not display names.
  A `scenario=` the feature does not register fails the build and lists the
  ones it does.
- A marker without `scenario=` drops **every** scenario of the feature in one
  place. Use it only for a page that is a single task. On a page with sections
  it is the wall of videos.
- A scenario no section needs is simply not cited; its feature still counts as
  documented through the others.
- A rebuild rewrites only the region between the markers. Everything around
  them is yours. Frontmatter the compiler does not own (`slug`,
  `sidebar_position`, `draft`) passes through.

Organise pages by who reads them, not by feature: `docs/using/`,
`docs/teaching/`, `docs/organising/`. One feature may be cited from several
pages, one page may cite several features.

## 2. Plan from the suite before writing

Do this first, in a scratch table. It is what makes every later step
mechanical, and skipping it is how sections end up with no figure or with a
figure of something else.

1. **Inventory.** List every `pikkuFeature` and, under each, its scenarios with
   their actor and the screen each one ends on. Read the scenario files, not
   just the names.
2. **Outline.** Group the scenarios into reader jobs (pages) and tasks
   (sections). A section is usually one scenario; two scenarios that show the
   same task from two sides (it works / it is refused) can share a section, one
   marker each.
3. **Mark what cannot be shown.** A task with no browser scenario gets no
   marker — write it anyway if readers need it, and say in your hand-over which
   sections have no evidence. Never cite a scenario that shows something else
   because it is nearby.
4. **Decide the still.** For each cited scenario, name the moment its
   screenshot should capture — the state the section's "what you see
   afterwards" describes. §4 is how it gets taken.

## 3. Writing the section

Write it so a reader can do the task **with every figure removed**. The figures
confirm; they do not instruct. A reader skims for the step they are stuck on,
and cannot search a video.

Before writing a section, open the screen's component and its message catalog,
then the scenario. The screen is what renders; the scenario is what is proven,
and its steps are the reader's journey already in order. Write only what you
have seen in one of them — a fluent section describing a flow that does not
exist is worse than none.

Write in the app's language — the one on its screens and in its default
locale, not English by default. Each page carries:

- **Why and when** — one short paragraph at the top: what this is for, and when
  the reader would reach for it. Never "This page documents…".
- **Per section: the steps** — a numbered list, each an action in the words on
  the screen: "Open **Patienten** and choose **Patient anlegen**." Name buttons,
  tabs and fields exactly as they read, in bold.
- **Per section: what you see afterwards** — the state that means it worked.
  This is the sentence the still illustrates.
- **What goes wrong** — the refusal, the empty state, the thing that looks
  broken but is not. Every `expectError` and every empty state a scenario lands
  in is a candidate; this is usually what readers came for.
- **Where next** — links to the pages a reader goes to from here.

Reassurance is content: "Codes held in reserve cost nothing until a patient
uses one" is what stops a reader hesitating over the button. Explain the
confusing thing, not the impressive one.

A page that exists only to cite a feature — "every page loads", "acceptance",
a smoke suite — is not a page. Cite that feature from the page whose screens it
covers, or mark it `document: false`.

### Captions are copy

Two strings from the suite reach the page as captions:

| Figure | Caption |
|---|---|
| Screenshot | the `name` it was taken under |
| Recording | the scenario's `title` (plus ` — ` and the actor, when there are several) |

Write both as a reader-facing caption in the app's language: "Die Buchung mit
Status, Eckdaten und Reitern", "the course list, with places left on each
course". Not "booking-detail /admin/bookings/b_1 at 1440px", not "Admin renames
course — admin". Renaming a scenario `title` changes no behaviour.

## 4. Every cited scenario ends on a still

A section whose scenario filed only a recording gets a video and no picture —
the reader has to press play and scrub to find the one frame that matters.
Every scenario a section cites should take one showcase screenshot of the state
the section describes. Add the capture step once:

```ts snippet:guideCaptureStep
```

- Without `path` it photographs the screen the flow is on. Call it **after the
  scenario's last assertion**, so the shot is the proven end state (the room
  assigned, the invoice listed) rather than a page reloaded from a URL.
- With `path` it opens a screen first — for a section about a screen rather
  than an action.
- The `name` is the caption (see above). `{ showcase: true }` marks it fit to
  publish; `{ fullPage: true }` photographs the whole scrollable page.
- Contexts open at a pinned 1440×900 viewport with animations off, so two runs
  photograph the same thing. Call `page.setViewportSize` inside a step for a
  phone-width shot.

### The camera sees your seed data

Every figure shows whatever the scenario's personas and seed rows contain, so
they are part of the documentation:

- A persona's display name is in the header of every shot. "Scenario Admin" or
  "test-user-3" is on every page of the guide; give personas plausible names
  and roles.
- Seed rows are the example data a reader sees: in the app's language, the
  shape real data takes — no lorem ipsum, no English description inside a
  German UI, no `foo`, no ids as names.
- Changing seed data changes what scenarios assert; run the suite after.

### Traps that make a figure missing or wrong

- **RPC-only scenarios file no screenshot.** The command warns `whose run filed
  no screenshot — the block renders empty`. Add a browser capture, or do not
  cite that scenario.
- **A capture loop must iterate a named const.** `for (const s of [ … ])` with
  an inline array literal cannot be extracted (PKU679) and the scenario is
  silently empty. `const screens = [ … ] as const`, then `for (const s of screens)`.
- **A capture before an assertion moves the page from under it.** Capture last,
  or re-navigate.
- **A redirect photographs the wrong screen.** A first-time actor bounced to
  onboarding, a consent dialog, a login — the shot is named "the map" and shows
  something else. Finish the redirecting flow in the scenario first, and look
  at the image.
- **Locale.** Playwright reports `navigator.language` as `en-US`. An app that
  picks its locale from the browser renders English. Set the app's own stored
  locale with `page.addInitScript` in **every** step that navigates.

## 5. Every feature is accounted for

Every registered feature must be cited by some page, or the command fails by
name:

```
Feature 'barFeature' is cited by no page. Place `<!-- pikku:guide feature=barFeature -->` …
```

Write the page, or — for plumbing nobody reads about (a session-health check,
an internal sync) — declare `pikkuFeature({ …, document: false })`. Citing a
`document: false` feature is an error, and so is citing an id that is not a
registered feature. `--allow-undocumented` downgrades the uncited error to a
warning for a guide mid-way through; do not hand one over with it on.

## 6. Build it, then look at it

```sh
# 1. a full, passing browser run that writes the shots to disk
bunx --bun pikku scenario run local --run browser --screenshots

# 2. merge prose + evidence → .pikku/guide/
bunx --bun pikku scenario guide --docs docs
```

- `--screenshots` is what writes files. Without it every block is empty.
- The run must have **passed**, and must be **the whole suite**. A run narrowed
  with `--flows`, `--features`, `--tags` or `--exclude-tags` is refused — keep
  every narrowing flag out of a CI invocation whose run feeds the guide.
  `--run-id <id>` picks an older full run.

Then open the generated pages and **look at the images** — read them, do not
just count them. Most bad figures are only visible this way: the wrong screen,
a dialog half-open, an empty list because the seed had no rows, English on a
German page, "Scenario Admin" in the corner.

## 7. `.guide.lock` — keeping prose honest

`docs/.guide.lock` records, per feature, a hash of its scenarios' step
sentences and artifact ids — not image bytes, so restyling the UI stales
nothing. Inserting, renaming or reordering a step reports the page:

```
docs/using/booking.md was written against 'bookingsFeature' at 3f1a…, which is now 9c0e… — the flow moved, so re-read the prose around that block.
```

Re-read that page's text, fix what the flow change made untrue, rebuild. The
first build after adding pages warns for every feature (there was no lock);
the second is clean. Commit the lock; never hand-edit or hand-merge it.

## 8. Hand-over checklist

- [ ] Every section with instructions is followed by its own `scenario=`
      marker, or is listed in the hand-over as having no evidence.
- [ ] No page with sections uses a feature-wide marker.
- [ ] Every cited scenario takes a showcase screenshot of the state its
      section describes.
- [ ] Every page reads as instructions with its figures removed, in the app's
      language: why and when, numbered steps naming controls as they read,
      what you see, what goes wrong.
- [ ] Captions (screenshot names, scenario titles) are reader copy — no routes,
      sizes, test ids or actor names.
- [ ] Personas and seed data on camera look like real use, in the app's
      language.
- [ ] Every feature is cited or `document: false`; no `--allow-undocumented`.
- [ ] Built from a full, passing `--run browser --screenshots` run; no "block
      renders empty" or stale warnings after the second build.
- [ ] You opened the generated pages and looked at every image.
- [ ] `docs/` and `docs/.guide.lock` committed; `.pikku/guide/` is output.
