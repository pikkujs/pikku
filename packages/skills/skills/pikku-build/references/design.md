# Make it look like someone designed it

Two separate jobs, and conflating them is why open-source builds come out looking
like the template:

- **Direction** — deciding what it should look like. **No open-source tool does
  this.** Fabric has `fabric-theme`; you have §1's answer and this file.
- **Critique** — judging how well the built screens execute that direction.
  `impeccable` does this well, and it is free.

Impeccable audits the design you chose. It will never tell you the app should
have looked like something else — it will happily award a clean bill of health to
a perfectly-executed default. Skip the direction step and you ship Neutral with
good spacing.

## Author the theme — the step nothing does for you

The look lives in `packages/mantine-theme`, and it is data, not code — one JSON
per theme, `active.json` naming the live one. **Read [theming.md](references/theming.md)**
for the file layout, what each field changes, and how to turn a direction in
words into a theme.

Three things belong here rather than in that reference, because they govern every
screen you then build:

**Set the theme once, don't hardcode colours per component.** A screen full of
inline `color="blue"` and one-off hex values is why apps look templated. Change
the theme, not the components — and keep it theme-aware for light and dark.

With two apps, **share the theme package and vary the register, not the
palette.** A back-office can be denser and more tabular; a customer-facing app
can be roomier and warmer — that is `structure` and layout, not a second `brand`.
Two unrelated colour schemes read as two products from two companies.

Then **write the direction into `knowledge/decisions/design/`** — the words the
user gave you, what you chose, and what it rules out. The JSON records what the
theme is; only the note records why.

## Compose real components, then critique

**Compose with Mantine's rich components — not tables and text everywhere:**

- **`@mantine/charts`** (Recharts underneath) for overviews — `AreaChart`,
  `BarChart`, `LineChart`, `DonutChart`, `Sparkline`. A metric worth showing is
  worth a chart, not a number in a `Text`.
- **`@mantine/dates`** for anything time-based — `DatePicker`, `Calendar`,
  `DateTimePicker`, range inputs. Never hand-roll a date field.
- Composed layouts over flat lists — `Timeline` for history, `Stepper` for
  multi-step progress, `Card` + `SimpleGrid` for a gallery, `RingProgress` for
  completion, `Badge`/`ThemeIcon` for status.

Both ship in the template's app dependencies. Look each one up in the Mantine
llms.txt and use the real component.

Then critique it. Free, and works across coding agents:

```sh
npx impeccable install     # current releases need Node 22.18+
```

Impeccable scores a screen against interaction heuristics and names what is
wrong: hierarchy, spacing, type registers, states you forgot. Run it on **every**
screen in **every** app, fix what it finds, and re-run the ones you changed.

**Screenshot each page and feed it the images.** Without them its findings drop
to inference from source, and it misses real misalignment, contrast, and
overflow. Judging your own UI from source code is guessing.

**Screenshot at a phone width too (≈390px), not just desktop, and critique
those.** A layout that is fine at 1440px routinely breaks at 390 — a table that
overflows, a row of buttons that wraps into a pile, text jammed against the edge,
a modal taller than the viewport. Mantine gives you the tools (responsive `Grid`,
`visibleFrom` / `hiddenFrom`, `Stack` instead of `Group` at small sizes); use
them. The template already mounts a phone navigation per `AGENTS.md` — pick
`MobileTabBar` or `MobileNavDrawer` deliberately per app, never both.

The gate: **no P0 findings left on any screen, in any app, at either width.**
Don't silence a finding by deleting the feature it is about.
