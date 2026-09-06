# Making it look like a studio built it

Read this **before the first screen is built**, not at §8. A design pass on eight
milestones of scaffolded screens is a repaint; a direction decided first is a
design.

The failure this exists to prevent has a signature. It is not ugly colours or bad
spacing — the theme usually handles those. It is a screen assembled out of
whatever component was nearest: a `Stack` of `Card`s, a form at the top, one
`Title`, a grid of identical boxes, sixty rows that all look equally important.
It typechecks, it passes contrast, every feature works, and it looks like nobody
decided anything. **Working is the floor, not the deliverable.**

## The bar

Before you hand a screen over, answer these out loud. They are not rhetorical —
each one has caught a real screen.

1. **What question does someone open this screen to ask?** Is the answer in the
   first viewport, in the largest type on the page? If the top of the screen is a
   form, the answer is no.
2. **Could you take in the state of things in two seconds without reading?**
   Something must carry meaning pre-attentively — a colour rail, a weight, a
   count. If the only difference between "expired" and "fine" is words in the
   same grey, the screen cannot be scanned.
3. **What is the ratio of chrome to content?** Count the buttons. A per-item
   action repeated down a list of sixty is a hundred and twenty buttons, and they
   are painted over the names you are trying to read.
4. **Does every group have a reason to exist?** A section called "urgent" holding
   half the list triages nothing. If a threshold puts most of the data in the
   exception bucket, the threshold is wrong, not the data.
5. **What does it look like with real volume?** Design against the seed you would
   demo, not three rows. Sixty is a different screen from three, and the layout
   that survives three often collapses at sixty.
6. **Would you show it to the user without apologising for it?** If the honest
   answer is "it works", it is not finished.

## Composition — the part no theme can do for you

A theme sets colour, radius, type and shadow. Everything below is layout, and no
`defaultProps` will save a screen that gets it wrong.

**Content before controls.** The list is why the screen exists; the form that
adds to it is not. A three-field add form at the top of a phone screen is the
entire first viewport, and the fridge you opened the app to look at starts below
the fold. Put the answer first, and let the input be a control you open — or a
single tight row, never a stacked column of full-width fields.

**One entry point per job, not two.** Two cards stacked at the top of a screen,
both meaning "add something", is a decision nobody made. Merge them: one surface,
the common way in and the other way in beside it.

**Rows, not cards, once a list has depth.** A card says "this is a thing worth
looking at on its own"; sixty of them say nothing. Past roughly a dozen items,
one-line rows scan better, fit twice the information per screen, and let a
coloured rail down the left carry urgency at a glance. Keep cards for a handful
of rich objects, a gallery, or a dashboard tile.

**Group with headings that carry their count.** `Eat these first 5` is a heading
somebody can act on; a heading with a sentence underneath saying "5 things are
about to turn" says it twice and reads as filler. The count is the number you
check before deciding whether to read the group at all.

**Quiet the repeated action.** Per-row buttons should be `subtle` or revealed on
the row, never filled — but still 44px, because quiet is a visual decision and
tap targets are not. Filled buttons are for the one action the screen is for.

**One meta line, not three badges.** State, quantity, date — in the order they
are asked for, in one text node so it wraps like a sentence. Three separate pills
in a `Group` wrap into a ragged pile at 390px and leave separators stranded at
the end of a line.

**Never say the same thing twice in one row.** "Use by tomorrow · 1 bag · Use by
Sep 7" is one fact wearing two hats. Cut one.

**Every colour means something.** If the palette has an urgency ramp, nothing
decorative may use it, and nothing that means urgency may be drawn in anything
else. A colour used both ways stops being a signal.

**Colour is never the only signal.** Whatever the rail says, the words say too —
for greyscale, for colour blindness, and for a screen reader.

## The screens agents forget

**The login page is the entry point, and it is usually the least designed screen
in the app.** It is the first thing anyone sees, it is where a demo starts, and a
default auth card with a wordmark on it says "scaffold" before the product has
said anything. Give it the direction the rest of the app has: real proportions, a
considered background, the product's voice in the heading rather than "Sign in".

**Never render a sign-in method that is not configured.** A "Continue with
Google" button on an app with no Google credentials is a dead control on the
first screen. Render the social buttons from what `socialProviders` actually
declares, and when it declares none, the divider goes too — not just the button.

**The navigation is a design surface, not shell furniture.** The scaffold mounts
a working nav; working is not the same as considered. Decide the destinations
(five at most — a tab bar overflows past four), give the labels room to be
legible at 11px or more, and style it through the theme's `NavLink` /
`defaultProps` rather than leaving the component defaults. A nav bar is on every
screen; it is the highest-leverage surface in the app.

**Empty, loading and error are three designed states, not three omissions.** An
empty list is the state a new user sees first and the one most likely to be
skipped. Skeletons should be the shape of the rows they replace.

## Judge it against real data

**Reset the dev database before you look at anything.** Scenario runs write into
it, and they deliberately tag rows with a run id so assertions do not collide —
so after a few runs the app is full of `Ripe peaches d193e2aa` and `Soured cream
f7b8cef7`, seven copies deep. Nobody's fridge looks like that, and a screen
judged against that data gets designed for a problem it does not have. `pikku db
reset` replays the migrations and the seed.

The dev server holds an open handle to the database file, so **restart it after a
reset** — otherwise every call fails with `disk I/O error` and the app looks
broken for a reason that has nothing to do with the app.

**Make the seed realistic while you are there.** A seed with a deliberate spread —
a couple already expired, some due tomorrow, a normal week's worth, a few that
never expire — designs the urgency bands for you. A seed of three identical rows
teaches you nothing about the screen you are building.

## Order of work

1. **Direction first** — §1's answer, then the theme (`references/theming.md`),
   then a note in `knowledge/decisions/design/` saying what you chose and what it
   rules out.
2. **One reference screen, designed properly, before the second milestone builds
   anything.** Every screen after it copies its register — its density, its row
   shape, its heading rhythm. Getting the first one right is the cheapest design
   work in the project; the eighth screen is a repaint of eight.
3. **Look at it at 390 and at 1440, with real data, at every milestone** — not
   once at the end. A screen that was fine at three rows is a different screen at
   sixty, and the milestone that added the sixty is the cheapest place to notice.
4. **Critique last.** `impeccable` scores execution against the direction you
   chose. It will award a clean bill of health to a perfectly executed default,
   so it is the check on step 2, never the substitute for it.

## The gate

- No P0 findings on any screen, at 390 and at 1440.
- Contrast and tap targets pass — `pikku-a11y` covers the measurement, and note
  that a Mantine `light` variant paints its label at the generated ramp's stop,
  which lands just under AA on its own tint. Name the darker ink once and reuse
  it.
- Every screen answers the six questions at the top of this file.
- The first screen anyone sees — the login — has been designed, not scaffolded.
