# Authoring the theme

Read this at the design step, once you have a direction to turn into a theme —
whether the user described one in words, handed you a reference, or ran their own
design step whose output you are implementing.

The look is a small set of CSS variables. `pikku theme apply` writes them; you
choose the inputs.

## Where the look lives

```
packages/theme/
  themes/
    default.json     # "Neutral" — the shipped scaffold
    <id>.json        # one file per theme: { brand, structure }
  active.json        # { "id": "default" } — which one is live
  theme.css          # GENERATED — the shadcn tokens, :root and .dark
```

Each theme JSON has two halves — `brand` (colours, fonts) and `structure`
(radius, shadows, density, page and ink). To give the product an identity, run
`pikku theme apply --preset <id>` with your colours and fonts; it writes
`themes/<id>.json`, points `active.json` at it and regenerates `theme.css`. The
app imports `theme.css` once, so `bg-primary`, `rounded-lg` and `font-heading`
follow it.

Turning §1's answer into a theme:

- **Colour before anything else.** `--primary` carries most of the identity.
  `pikku theme apply` expands one hex into the full token set and picks a readable
  `-foreground` for each fill.
- **Fonts are the other half of the register**, and the half people skip. A serif
  heading font against a neutral body is a different product from the system
  stack, and it is one flag.
- **`structure.radius` and `structure.shadows` set the temperature.** Sharp
  corners and flat surfaces read technical; large radii and soft shadows read
  consumer. Neutral's `0.625rem` is the middle of the road on purpose.
- **A repeated decision goes in the component, not on every instance.** Cards
  always bordered, nav items always `ghost` — change the default variant in
  `src/components/ui/<name>.tsx` once.
- **`defaultColorScheme` and `darkSurface` are a real choice**, not a toggle to
  leave alone. A tool people live in all day is often better dark by default.

Then **write the direction into `knowledge/decisions/design/`** — the words the
user gave you, what you chose, and what it rules out. The JSON records what the
theme is; only the note records why.

## The colours the theme has no field for

`brand` is the product's accent. It is not the only colour a screen needs, and
the missing ones are why "don't hardcode colours per component" gets broken by
the same agent that wrote it down.

A screen has to say *covered* and *still open*, *fine* and *needs attention* —
and those are not the accent. Using the accent for them is worse than a stray
hex: the brand colour stops meaning "this product" and starts meaning "good", so
it means nothing. But there is no `brand.covered` field, so the value lands
inline as `bg-[#3f7d5c]`, once per component, slightly different each time —
which `@shadcn/lint` rejects.

Give them a home. Declare them once in the app's `src/styles/domain.css`, imported
beside `theme.css`, and map them into Tailwind so they become utilities:

```css
:root {
  --covered: oklch(0.55 0.09 155);   --covered-bg: oklch(0.95 0.03 155);
  --open:    oklch(0.58 0.11 75);    --open-bg:    oklch(0.96 0.04 75);
  --sunk:    oklch(0.98 0.005 40);   /* a recessed surface, for forms and asides */
}
.dark {
  --covered: oklch(0.75 0.09 155);   --covered-bg: oklch(0.28 0.03 155);
  --open:    oklch(0.78 0.1 75);     --open-bg:    oklch(0.30 0.04 75);
  --sunk:    oklch(0.2 0.01 40);
}

@theme inline {
  --color-covered: var(--covered);   --color-covered-bg: var(--covered-bg);
  --color-open: var(--open);         --color-open-bg: var(--open-bg);
  --color-sunk: var(--sunk);
}
```

`bg-covered-bg text-covered` now follows the theme in both schemes, and the lint
rules know the tokens. Those values are one app's warm direction, not a palette to
copy — derive your own from yours.

Name them for what they *mean* in this product, never for the colour — `covered`,
not `green`. The name is the whole value: it survives a change of palette, and it
is the thing that makes the second use agree with the first. Define both colour
schemes at once; a token defined only in `:root` is the classic unreadable-in-dark
bug, and Tailwind will happily render it.

## Choose the neutrals; do not inherit them

Tailwind's default grey ramp is blue-biased, and so is every shadcn preset that
leaves `--border`, `--muted` and `--input` at their stock values. Those tokens
draw card borders, dividers, the shell's edges and every disabled control. If the
accent is not itself blue, that mismatch lands on every screen at once: warm
content ruled off in cold lines, off everywhere and wrong nowhere in particular,
which is the hardest kind of wrong to find. It survives a careful critique
because no single screen is broken.

`pikku theme apply` tints the neutral ramp toward the primary's hue and keeps the
lightness steps, so contrast behaviour is unchanged. Do not overwrite the neutrals
in `domain.css` with raw greys. If you need a different tint, change the brand
colour or pass `--page` and `--ink`.

Check the text tokens against your own grounds rather than trusting them —
`--muted-foreground` is the most-used secondary text colour in the app and the
easiest to drop below 4.5:1 while making it prettier, and it has to clear the bar
on *both* grounds.

The same file is where a couple of other things belong that the theme JSON has no
field for and every screen otherwise re-invents: the hairline that separates rows
in a list, the recessed surface a form sits on so it does not carry the same
weight as the content it adds to, and the one animation the product is allowed
(behind `motion-safe:`). Two or three rules, not a framework.

If the app ships template screens you did not write — the error and not-found
pages usually — read them before you call the palette done. A stock blue accent
on an app whose direction says warm is the single loudest contradiction in the
build. Once the theme is applied, **the only thing that proves it is looking at a
screenshot**: regenerate, reload, and compare the page to the direction you wrote.

**Set the theme once, don't hardcode colours per component.** A screen full of
`bg-blue-500` and one-off hex values is why apps look templated. Change the
theme, not the components — and keep it theme-aware for light and dark.

With two apps, **share the theme package and vary the register, not the
palette.** A back-office can be denser and more tabular; a customer-facing app
can be roomier and warmer — that is `structure` and layout, not a second `brand`.
Two unrelated colour schemes read as two products from two companies.


## If the user gave you no direction

Neutral is a legitimate answer for an internal tool. But say so out loud when you
hand the work over — an unremarked default reads as a choice, and the user will
assume someone decided.
