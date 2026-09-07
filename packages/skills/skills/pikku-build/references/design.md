# Design

Your job here is to design something worth the product — not to apply a house
style. **There is no house style, and this file is not one.** Two apps built from
this skill should not look like each other; if they do, something has gone wrong
that no amount of spacing will fix.

So: no prescribed layouts, no component rules, no ratios. What follows is the
process that makes freedom accountable, the handful of facts that are not
matters of taste, and the symptoms of a screen nobody actually designed.

## Commit to a direction before the first screen

An agent given "make it look good" and nothing else defaults — to the component
nearest to hand, on every screen, in every app. Not because it lacks taste, but
because there is nothing to be wrong against. A direction fixes that: state one,
in words, before any screen exists.

Say what this product *is* — its register, its reference points, what it feels
like to use, what it is deliberately not. "A warm, food-forward thing you use
standing at an open fridge door, closer to a recipe card than to a dashboard, and
never clinical" is a direction. "Clean and modern" is not — it rules nothing out,
so it cannot be departed from.

Write it to `knowledge/decisions/design/`, then build the theme from it
(`references/theming.md`). **From that point you are accountable to your own
direction, not to this file.** That is the whole mechanism: the freedom is real,
and so is the commitment.

Be ambitious with it. A direction that could describe any SaaS app has not been
chosen — it has been defaulted to in words instead of in components.

## Offer to draw the screens before you build them

Before the first milestone, **ask** whether they want to see the screens first.
One question, in §1's round, not a gate of its own:

> Want me to mock the main screens as a page you can look at before I build
> anything? It takes a few minutes and it is much cheaper to change a picture
> than a built screen.

If they decline, build; the direction in words is enough to be accountable to.
If they accept, this is the cheapest decision in the project — a picture of eight
screens costs a fraction of eight built screens, and it is the only point where
"that is not what I meant" is free.

**What to make.** One self-contained HTML page holding every screen the app
needs — not a prototype, not a click-through. Static markup, real content from
their domain (never lorem), the empty and error states beside the happy path,
laid out so the whole app is legible by scrolling. Plain hand-written CSS.
Whatever your host offers for showing a page is how you show it — a Claude
Artifact, a file they open, a preview server. The page is the deliverable; how it
gets in front of them is not this file's business.

Write it to `knowledge/decisions/design/screens.html` and treat it as **source of
truth for the screens** once they approve it. That has consequences worth
stating:

- The milestones are read off it. A screen in the mock that no milestone builds
  is a gap in the plan, not a spare drawing.
- A screen the build turns out to need that the mock does not have means the
  mock was wrong. Update it, and say you did. Do not let the app and the mock
  drift and then quietly prefer the app.
- The knowledge graph still owns the domain — objects, roles, rules. The mock
  owns what the screens look like. When they disagree about a *fact*, knowledge
  wins; when they disagree about a *layout*, the mock wins.

**Then realise it in Mantine — in the theme, not in overrides.** The mock is
plain CSS and knows nothing about Mantine, so closing the gap is real work, and
there are two ways to do it. Only one of them is worth having:

- **In the theme.** Push the mock's decisions into the Mantine theme object and
  its CSS variables — the palette, the radius scale, the spacing rhythm, the
  font stack, the default props components inherit. Do this and you end up with a
  component library that is actually themed, and the next screen is free.
- **In per-component overrides.** A stack of one-off `className`s and
  `!important` fighting Mantine's defaults screen by screen. This looks like
  progress on screen one and is unmaintainable by screen five, and the screens
  drift apart because nothing central holds them together.

Author the mock's CSS as custom properties on `:root` from the start, using the
names `references/theming.md` gives the theme. Then the gap is largely a mapping
rather than a translation, and the mock doubles as the theme spec.

**Checking the built screen against the mock** is a structural comparison, not a
pixel one: the same regions in the same order, the same hierarchy, the same
states present, the same tokens used. Do not chase pixel equality — Mantine's
components have their own metrics and the mock was drawn without them. A built
screen that reads as the same screen has passed.

## One screen, designed properly, before the rest exist

Design the first real screen as if it were the only one, and take it further than
feels necessary. Every screen after it inherits its register — its density, its
rhythm, what a row of data looks like, how state is signalled. That inheritance
happens whether you plan it or not, so make the first one worth inheriting.

This is also the cheapest design work in the project. The eighth screen is a
repaint of eight; the first is a decision.

## Judge it — and don't grade your own homework

Models rate their own output generously, and "does this look good?" answered by
the thing that made it is always yes. Use evidence.

- **Screenshot every screen and look at the image**, at ~390px and at ~1440px.
  Judging your own UI from source is guessing, and the failures that matter —
  proportion, hierarchy, a wall of identical boxes — are invisible in JSX.
- **Run `impeccable`** (`npx impeccable install`, Node 22.18+) and feed it the
  screenshots. It is external, it does not flatter, and it scores execution
  against interaction heuristics. But it audits how well you executed the design
  you chose — it will award a clean bill of health to a perfectly executed
  default. It checks step 2; it never replaces it.
- **Look at every milestone, not once at the end.** A screen that was fine at
  three rows is a different screen at sixty, and the milestone that added the
  sixty is the cheapest place to notice.

Questions worth answering honestly, per screen. The answers are yours; only the
questions are fixed:

1. What question does someone open this screen to ask, and how fast do they get
   the answer?
2. What can be understood before reading a word?
3. What is here that is not earning its space?
4. What does it look like at real volume, and at 390px?
5. Does it look like the direction you committed to — or like the components you
   had?
6. Would you show it to the user without apologising for it?

## Facts, not taste

These are not design opinions and are not open to a different answer.

- **Reset the dev database before judging anything.** Scenario runs deliberately
  tag rows with a run id so assertions do not collide, so after a few runs the
  app is full of `Ripe peaches d193e2aa`, seven copies deep. Nobody's data looks
  like that, and a screen designed against it is designed for a problem it does
  not have. `pikku db reset` replays the migrations and the seed — and the dev
  server holds an open handle to the file, so **restart it after**, or every call
  fails with `disk I/O error` and the app looks broken for reasons that are not
  the app.
- **Seed generously and realistically.** A seed with a deliberate spread designs
  the hard cases for you. Three identical rows teach you nothing.
- **Never render a sign-in method that is not configured.** A "Continue with
  Google" button on an app with no Google credentials is a dead control on the
  first screen anyone sees. Render social buttons from what `socialProviders`
  actually declares — and when it declares none, the divider goes too.
- **Empty, loading and error are states that exist.** The empty state is what a
  new user meets first and the one most often skipped entirely.
- **Contrast and tap targets are measured, not judged.** `pikku-a11y` covers it.
  One trap worth knowing: a Mantine `light` variant paints its label at the
  generated ramp's stop, which lands just under AA on its own tint — name the
  darker ink once and reuse it.

## Two screens that get skipped

Not rules about how they should look — only that they are yours to design.

**The login page is the entry point.** It is the first thing anyone sees, where
every demo starts, and routinely the least designed screen in the app: a default
card with a wordmark, saying "scaffold" before the product has said anything. It
gets the same direction as everything else.

**The navigation is on every screen**, which makes it the highest-leverage
surface you have. The scaffold mounts one that works; working is not the same as
considered. Decide the destinations and their number deliberately, and style it
through the theme rather than leaving the component defaults — the same look on
every app is the tell.

## Symptoms of a screen nobody designed

If a screen shows these, you defaulted. **The fix is yours to choose** — these
are a diagnosis, not a prescription, and the interesting answer is rarely the
first one.

- The top of the screen is a form, and the content it acts on starts below the
  fold.
- Two adjacent surfaces do the same job because both were added separately.
- Everything is the same size, weight and colour, so nothing can be found
  without reading it.
- The same fact is stated twice in one line, in two different components.
- A section named for an exception holds half the data.
- Every row carries the same buttons, and the buttons outweigh the content.
- The palette's meaningful colours are also used decoratively, so they have
  stopped meaning anything.
- It looks like the last app you built.
