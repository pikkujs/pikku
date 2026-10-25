---
name: pikku-theme
description: >-
  Giving a Pikku Tailwind + shadcn/ui app its look: `pikku ui theme list|apply`, brand
  colours/fonts/page/ink over a preset, matching an existing look, cva component variants, replacing
  template names (`pikku validate` flags them), emails/theme.json, plus light/dark and WCAG contrast
  rules. TRIGGER when: asked to theme, restyle, rebrand or recolour; the project has packages/theme
  (themes/*.json, active.json); a screen needs a colour, font, radius or shadow; or template names
  still show. DO NOT TRIGGER for data rendering or RTL layout (use pikku-tailwind), email templates
  (use pikku-emails) or accessibility beyond colour (use pikku-a11y).
installGroups: [client]
---

# Theming a Pikku Tailwind app

The look of the app lives in one package, `packages/theme`, and the CLI owns it. Do not hand-edit
the theme JSON or the generated `theme.css` to change the look; run `pikku ui theme apply`. Every
colour in app code then comes from the theme, never a literal.

## The theme package

```
packages/theme/
  themes/
    default.json      # one file per theme: { name, description, brand, structure }
    <id>.json         # written by `pikku ui theme apply`
  active.json         # { "id": "<id>" } — which theme the app renders
  base.json           # optional: spacing / radius / fontSizes scales shared by every theme
  theme.css           # GENERATED on every apply/switch — never edit
```

The app imports `theme.css` once, after Tailwind. It holds the shadcn tokens as CSS variables in
OKLCH, a `:root` block for light and a `.dark` block for dark, and the font variables. Tailwind's
`@theme inline` maps those variables to utilities, so `bg-primary`, `text-muted-foreground` and
`rounded-lg` follow the active theme with no JavaScript.

A theme is ONE set of tokens in two halves:

- **brand** — `colors` (`primary`, `secondary`, `accent`, as hex) and `fonts` (`heading`, `body`,
  optional `mono`, each a Google Fonts family). This is what makes two apps look different.
- **structure** — the depth: `radius` (the base for `rounded-*`), `shadows` (`xs`..`xl`), `density`
  (the spacing scale), `page` (light page colour), `ink` (light text colour), `defaultColorScheme`,
  and an optional `darkSurface` ramp. This is what makes styles read as genuinely different rather
  than recoloured.

`pikku ui theme apply` generates the whole token set from those inputs: each brand colour becomes
`--primary`, `--secondary`, `--accent` with a matching `-foreground` picked for contrast, the neutral
ramp (`--background`, `--card`, `--muted`, `--border`, `--input`, `--ring`) is tinted toward the
primary's hue unless `darkSurface` is given, and `--muted-foreground` is darkened in light mode so it
clears AA. The frontend writes plain `<Card>` and `<Button>` and inherits all of it.

## Presets, structures and brands

A **preset** pairs a brand and a structure under one id and tags the kinds of app it suits.
`pikku ui theme list` prints the themes on disk, the active id, the listed presets (with `suits` tags)
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

## `pikku ui theme apply`

```bash
pikku ui theme list
pikku ui theme apply --preset breeze
pikku ui theme apply --preset storybook \
  --primary '#2F5D62' --secondary '#A7774B' --accent '#D9A441' \
  --font-heading 'Young Serif' --font-body 'Literata' \
  --page '#FBF5EA' --ink '#2A2118'
pikku ui theme apply --preset quorum --structure monopro
```

| Flag                                   | Sets                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--preset <id>`                        | starting brand + structure; the theme is written as `themes/<id>.json` (no preset → `custom`, based on the first preset) |
| `--structure <id>`                     | swap in another preset's structure (depth) under this brand                                                              |
| `--primary`, `--secondary`, `--accent` | brand colours, hex                                                                                                       |
| `--font-heading`, `--font-body`        | Google Fonts families                                                                                                    |
| `--mode light\|dark`                   | `light` (default). `dark` makes `--page`/`--ink` the dark ground and its text (see Dark designs)                         |
| `--page`                               | page colour (`structure.page`) — paper, linen, bone instead of white; with `--mode dark`, the dark ground                |
| `--ink`                                | text colour (`structure.ink`); with `--mode dark`, the text on the dark ground                                           |

Flags are flat scalars, one value each; there is no nested `--colors` object. One call writes the
theme, makes it active, regenerates `themes/index.ts` (so the running app reloads) and re-brands
`emails/theme.json`. There is no separate activate step. Re-running with the same preset overwrites
that theme file.

Fine-grained structure tweaks the flags do not cover (a shadow scale, the radius base) are edits to
the active `themes/<id>.json` `structure`, followed by `pikku ui theme apply` to regenerate
`theme.css`; keep them in the theme, not in components.

## Dark designs

`--page`/`--ink` are light-mode colours unless you pass `--mode dark`. For a design that is dark
(a dark reference, a dark ground in the brief) always pass `--mode dark` with its ground and text:

```bash
pikku ui theme apply --preset linear --mode dark \
  --primary '#c6ff3d' --secondary '#22262d' --page '#14161a' --ink '#eef1f4'
```

Every other token is derived for that ground: card and popover a step lighter, muted a further
step, muted text a mid tone of the ink at 4.5:1 or better, border and input visibly above the card,
and each `-foreground` black or white by contrast against its actual fill (so a lime primary gets a
dark label). The same values are written to `:root` and `.dark` (with `color-scheme: dark`), so a
stored scheme or `class="dark"` never switches to the preset's unrelated greys. Without
`--mode dark`, a dark `--page` is derived as a light ground and comes out wrong.

After every apply the command prints a contrast report (text/page, muted-text/page,
primary-foreground/primary, border/page, input/page) and warns on any pair under its target; fix
the colours and re-run, the exit code stays 0.

## Colour rule

Every colour in app code comes from the theme: a semantic utility (`bg-primary`, `text-foreground`,
`bg-muted`, `border-border`, `text-destructive`) or a token your theme exports. No hex, `rgb()`,
`hsl()`, named CSS colour, arbitrary value (`bg-[#2F5D62]`), raw palette class (`bg-blue-500`),
ad-hoc alpha or one-scheme shade in components or CSS. Gradients, tinted borders and shadows follow
the same rule: define them as tokens in the theme and reference them. `@shadcn/lint` enforces this
and names the token to use instead. Before finishing UI work, run it and scan the changed files for
colour literals.

## Light, dark and contrast

- Always set `structure.defaultColorScheme`. It decides which block the page boots in; a theme
  without it boots dark.
- A dark-first structure ships an explicit `darkSurface` ramp (lightest text to deepest background).
  Without one, the dark ramp is tinted toward the primary's hue; a near-grey primary stays neutral.
- Semantic tokens already switch per scheme, so most classes need no `dark:` prefix. Use `dark:` only
  to choose between theme tokens. Never hardcode a shade for one scheme; see pikku-tailwind.
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
- Every `-foreground` token is generated from its surface, so a filled button gets a readable
  label. The page/ink you pass with `--page`/`--ink` must clear 4.5:1 against each other, and the
  primary must still read on the page.
- One status vocabulary: red, amber/yellow, green, plus a neutral. Do not add a second spelling of
  a colour that already exists.

## Custom variants and component metadata

Read a component's `cva` definition in `src/components/ui/` for the variants and sizes it accepts before guessing a `variant` or `size` value.

A custom variant is added where the component defines its variants, in the component file:

```js
const buttonVariants = cva('...', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      brand: 'bg-accent text-accent-foreground hover:bg-accent/90',
    },
  },
})
```

`@shadcn/lint` then accepts `variant="brand"` and its error messages suggest it. Use theme tokens only inside a variant. Add it
once and use it; do not restyle one button inline.

## Names and emails

The starter templates ship with placeholder names. Replace them before anything else ships.
`pikku validate` reports each place still using a template's name (the `placeholder-brand` checks):
`app__name` in the app's `messages/en.json` (the wordmark in the shell and auth screens), the
`title` / `og:title` / `og:site_name` meta in `src/app-meta.ts` or `__root.tsx`, and `appName` in
`emails/theme.json`. Update other app-identity strings (tagline, description) at the same time.

**Emails.** `pikku ui theme apply` rewrites `emails/theme.json`
from the applied theme: neutrals from the scheme (or the `darkSurface` ramp for a dark theme),
`accent`, `button` from the primary, `buttonText` black or white by luminance, `fonts.body` from
the brand. It merges, so `appName` and any project keys survive. It cannot know the app's name: set
`appName` yourself right after the first apply, because confirm-address and reset-password emails
send from the first signup. Then read `emails/locales/en.json` and fix any line that names the
template. `pikku emails catalog` lists ready-made emails (invitation, magic-link, password-reset,
receipt, welcome) and `pikku emails add <name>` copies one in; they use the same theme keys. See
pikku-emails.

## Matching an existing design

When the user names a live site or a design-tokens file, read its colours, fonts and depth yourself
and pass them to `pikku ui theme apply`. The recipe is in `references/from-a-reference.md`.

## Hosted only

Interactive theme pickers, design extraction, stock images, site crawling, favicon generation, AI-generated logos and
agent-driven build flows are not part of the CLI; a hosting platform may offer them.
