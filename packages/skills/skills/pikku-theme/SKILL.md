---
name: pikku-theme
description: >-
  Use when giving a Pikku Mantine app its look: picking and applying a theme with `pikku theme
  list|apply`, composing brand colours, fonts, page and ink over a preset's structure, matching an
  existing site with `pikku design extract`, declaring custom component variants and reading them
  back with `pikku components show`, pulling ready-made sections with `pikku blocks`, replacing
  template names and icons with `pikku design placeholders|favicon`, and keeping emails/theme.json
  on-brand. Also the light/dark and WCAG contrast rules a theme must clear. TRIGGER when: the user
  asks to theme, restyle, rebrand or recolour an app; the project has packages/mantine-theme
  (themes/*.json, active.json); a screen needs a colour, font, radius or shadow; or the app still
  shows a template name or default icon. DO NOT TRIGGER when: rendering data or RTL layout (use
  pikku-mantine), writing email templates (use pikku-emails), or accessibility beyond colour (use
  pikku-a11y).
installGroups: [client]
---

# Theming a Pikku Mantine app

The look of the app lives in one package, `packages/mantine-theme`, and the CLI owns it. Do not
hand-edit the theme JSON to change the look; run `pikku theme apply`. Every colour in app code
then comes from the theme, never a literal.

## The theme package

```
packages/mantine-theme/
  themes/
    default.json      # one file per theme: { name, description, brand, structure }
    <id>.json         # written by `pikku theme apply`
    index.ts          # GENERATED on every apply/switch — imports every themes/*.json; never edit
  active.json         # { "id": "<id>" } — which theme the app renders
  base.json           # optional: spacing / radius / fontSizes scales shared by every theme
  index.ts            # builds the Mantine theme(s) from the specs
```

A theme is ONE Mantine theme in two halves:

- **brand** — `colors` (`primary`, `secondary`, `accent`, as hex) and `fonts` (`heading`, `body`,
  optional `mono`, each a Google Fonts family). This is what makes two apps look different.
- **structure** — the depth: `defaultRadius`, `shadows` (`xs`..`xl`), `radius`, `spacing`,
  `components` (per-component `defaultProps`/`styles`), `defaultGradient`, `autoContrast`,
  `primaryShade`, `white` (light page colour), `black` (light ink), `defaultColorScheme`, and an
  optional 10-step `darkColors` tuple. This is what makes styles read as genuinely different rather
  than recoloured.

`@pikku/mantine/theme-spec` turns the stored specs into Mantine themes: `themeRegistry(themeSpecs,
activeId)` returns the built themes, the active one, each theme's colour scheme and the font
families to load (`googleFontsHref` builds the stylesheet link). `buildTheme` generates each brand
colour's 10-step tuple, tints the `dark` ramp toward the primary's hue unless `darkColors` is given,
strips `defaultColorScheme` and `darkColors` before `createTheme`, and routes the primary's filled
label and light background through per-scheme variables. `cssVariablesResolver` darkens light-mode
`dimmed` and `placeholder` text so they clear AA. The frontend writes plain `<Card>`, `<Paper>`,
`<Button>` and inherits all of it.

## Presets, structures and brands

A **preset** pairs a brand and a structure under one id and tags the kinds of app it suits.
`pikku theme list` prints the themes on disk, the active id, the listed presets (with `suits` tags)
and their structures. The full set, including the presets `list` hides but `apply` still accepts,
is in `references/presets.md`.

Choosing:

1. **Default to light.** A near-black UI flattens the palette, the depth and the type scale at
   once and is the most common "this looks cheap" tell. Pick a dark-first preset (`terminal`,
   `blueprint`, `neon`, `matrix`) only when the domain asks for it: developer and terminal tools,
   code and DevOps, media, music, observability.
2. **Tool or experience?** An app opened because a job requires it (CRM, booking, admin, finance)
   takes a workplace preset. An app someone opens because they want to (a story, a journal, a
   meditation or kids' app, a recipe box) takes a character preset (`storybook`, `stillness`),
   which carries a warm page colour and a reading body face. A story on `monopro` or `linear`
   comes out looking like a changelog, and later styling does not recover it.
3. **Lean bold.** The structure cascades to every component, so this one choice decides the look.
4. **Compose the app's own look on top.** Presets are starting points, not a menu. Take the preset
   whose STRUCTURE carries the right depth, then set colours, fonts, page and ink from what the app
   actually is.

## `pikku theme apply`

```bash
pikku theme list
pikku theme apply --preset breeze
pikku theme apply --preset storybook \
  --primary '#2F5D62' --secondary '#A7774B' --accent '#D9A441' \
  --font-heading 'Young Serif' --font-body 'Literata' \
  --page '#FBF5EA' --ink '#2A2118'
pikku theme apply --preset quorum --structure monopro
```

| Flag | Sets |
| --- | --- |
| `--preset <id>` | starting brand + structure; the theme is written as `themes/<id>.json` (no preset → `custom`, based on the first preset) |
| `--structure <id>` | swap in another preset's structure (depth) under this brand |
| `--primary`, `--secondary`, `--accent` | brand colours, hex |
| `--font-heading`, `--font-body` | Google Fonts families |
| `--page` | light-mode page colour (`structure.white`) — paper, linen, bone instead of white |
| `--ink` | light-mode text colour (`structure.black`) |

Flags are flat scalars, one value each; there is no nested `--colors` object. One call writes the
theme, makes it active, regenerates `themes/index.ts` (so the running app reloads) and re-brands
`emails/theme.json`. There is no separate activate step. Re-running with the same preset overwrites
that theme file.

Fine-grained structure tweaks the flags do not cover (a component's `defaultProps`, a shadow
scale) are edits to the active `themes/<id>.json` `structure`; keep them in the theme, not in
components.

## Colour rule

Every colour in app code comes from the theme: semantic names (`primary`, `secondary`, `accent`,
Mantine's named colours by role), `var(--mantine-color-*)` variables the theme defines, or a token
your theme package exports. No hex, `rgb()`, `hsl()`, named CSS colour, ad-hoc alpha or one-scheme
shade (`dark.6`, `gray.0`) in components or CSS modules. Gradients, tinted borders and shadows
follow the same rule: define them in the theme (`defaultGradient`, `shadows`) and reference them.
Before finishing UI work, scan the changed files for colour literals and replace them.

## Light, dark and contrast

- Always set `structure.defaultColorScheme`. It seeds `ColorSchemeScript` and `MantineProvider`; a
  theme without it boots dark.
- A dark-first structure ships an explicit `darkColors` tuple (index 0 lightest text, 7 body
  background, 9 deepest). Without one, the dark ramp is tinted toward the primary's hue; a
  near-grey primary stays neutral.
- Branch on scheme with `light-dark()` or Mantine variables, only between theme values. Never
  hardcode a shade for one scheme; see pikku-mantine.
- **Text clears 4.5:1 (WCAG AA) on every surface it can land on**, in both schemes. Verify, do not
  estimate. If you need a colour dimmer than the dimmest text token, change the layout.
- **Control boundaries clear 3:1** (WCAG 1.4.11): input borders, toggles, focus rings. A
  translucent fill cannot reach 3:1 on a dark surface; the border carries it.
- **Two tiers.** Text-tier colours (words, links, status labels) must clear 4.5:1. Graphic-tier
  colours (dots, bars, chart series, icons) need 3:1 and may be more chromatic, but never carry
  words. On white no amber that still reads as amber clears 4.5:1, so light-mode warnings are
  carried by a tinted fill with normal text, and the amber is only the mark.
- **Accent means state.** The accent marks selection, current item, active state, and means the
  same thing in both schemes. On an element regardless of its state, it is decoration.
- Leave `autoContrast: true` so filled buttons pick a readable label. The page/ink you pass with
  `--page`/`--ink` must clear 4.5:1 against each other, and the primary must still read on the page.
- One status vocabulary: red, amber/yellow, green, plus a neutral. Do not add a second spelling of
  a colour that already exists.

## Custom variants and component metadata

`pikku components list` prints the Mantine components the bundled metadata covers for the installed
`@mantine/core` major. `pikku components show <Name>` prints one component's props (with kinds,
options and defaults), variants, sizes, Styles API parts (`stylesNames`) and CSS variables. Check it
before guessing a prop or a `classNames` key.

A custom variant is declared in the active theme under
`structure.components.<Name>.variants.<variant>`:

```json
{ "structure": { "components": { "Button": { "variants": { "brand": {} } } } } }
```

`pikku components show Button` then lists `brand` beside `filled`, `light` and the rest, and any
editor reading the same metadata offers it. Mantine itself ignores the `variants` key: the look
comes from CSS keyed on the `data-variant` attribute Mantine sets on the root, for example
`.mantine-Button-root[data-variant='brand']` in the theme package's stylesheet, using theme
variables only. Declare it once in the theme and use `variant="brand"`; do not restyle one button
inline.

## Blocks

Ready-made, i18n-safe Mantine page sections: heroes, features, FAQ, contact, footers, headers,
navbars, auth screens, cards, stats, tables, inputs and more.

```bash
pikku blocks list                        # every block, plus the tags with counts
pikku blocks list --tag heroes
pikku blocks show HeroBullets            # files, i18n keys, npm deps, blocks it composes
pikku blocks show HeroBullets --out apps/app/src/components/hero
```

`show` resolves everything the block composes into one flat folder of files. `--out` writes them,
skipping any file that exists. Then add the printed i18n keys to the app's base locale (see
pikku-i18n), install any listed npm packages, and replace placeholder copy and empty media with the
app's real content. A block left with its default text is not done. Blocks inherit the theme; do not
add colours to them.

## Names, icons and emails

The starter templates ship with placeholder names. Replace them before anything else ships.

```bash
pikku design placeholders
```

It reports each place still using a template's name and how to fix it: `app__name` in the app's
`messages/en.json` (the wordmark in the shell and auth screens), the `title` / `og:title` /
`og:site_name` meta in `src/app-meta.ts` or `__root.tsx`, and `appName` in `emails/theme.json`.
Update other app-identity strings (tagline, description) at the same time.

```bash
pikku design favicon --source logo.svg
pikku design favicon --letter AC --background '#2F5D62'
pikku design favicon --emoji 🌙 --app apps/app
```

Renders the favicon, apple-touch and PWA manifest icons into the app's `public/` from a logo
(SVG/PNG/JPG/WebP) or a glyph, and links them from the document head. Needs Playwright's Chromium.
The glyph colour is chosen for contrast with `--background`; pass the theme's primary.

**Emails.** `pikku theme apply` (and `pikku design extract --apply`) rewrites `emails/theme.json`
from the applied theme: neutrals from the scheme (or the `darkColors` tuple for a dark theme),
`accent`, `button` from the primary, `buttonText` black or white by luminance, `fonts.body` from
the brand. It merges, so `appName` and any project keys survive. It cannot know the app's name: set
`appName` yourself right after the first apply, because confirm-address and reset-password emails
send from the first signup. Then read `emails/locales/en.json` and fix any line that names the
template. `pikku emails catalog` lists ready-made emails (invitation, magic-link, password-reset,
receipt, welcome) and `pikku emails add <name>` copies one in; they use the same theme keys. See
pikku-emails.

## Matching or rebuilding an existing design

When the user names a live site, a design-tokens file or a site to rebuild, extract first instead
of eyeballing: `pikku design extract`, `pikku design crawl` and `pikku design images`. The recipes
are in `references/from-a-reference.md`.

## Hosted only

Interactive theme pickers, AI-generated logos and agent-driven build flows exist only in hosted
Pikku platforms and are not part of the CLI.
