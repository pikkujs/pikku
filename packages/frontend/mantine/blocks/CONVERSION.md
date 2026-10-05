# Converting ui.mantine.dev blocks → pikku blocks

Turns a block from `mantinedev/ui.mantine.dev/lib/<Name>` into a pikku block that
compiles against the starter-template app (`@pikku/mantine/core` + paraglide i18n +
lucide icons). The reference block `NavbarNested/` (+ `NavbarLinksGroup/`, `UserButton/`)
is the GOLD STANDARD — match it exactly.

## Fetch the source

```
gh api repos/mantinedev/ui.mantine.dev/contents/lib/<Name> --jq '.[].name'
gh api repos/mantinedev/ui.mantine.dev/contents/lib/<Name>/<Name>.tsx --jq '.content' | base64 -d
gh api repos/mantinedev/ui.mantine.dev/contents/lib/<Name>/<Name>.module.css --jq '.content' | base64 -d
```

Ignore `*.story.tsx`, `*.test.tsx`, `attributes.json`.

## Output (write to `blocks/<Name>/`)

- `<Name>.tsx`
- `<Name>.module.css` (only if the source had one)
- `meta.json`
  Plus any local helper file the block needs (e.g. a small inline sub-component) — but if
  it depends on a block that ALSO exists in our set, import it as a sibling `./Dep` and list
  it in `dependsOn` (do NOT duplicate its file).

## Conversion rules (ALL mandatory)

1. **Imports**
   - `@mantine/core` → `@pikku/mantine/core`
   - `@mantine/hooks` → unchanged
   - `@tabler/icons-react` → `lucide-react`. Map each icon to its lucide name
     (`IconChevronRight`→`ChevronRight`, `IconGauge`→`Gauge`, `IconLock`→`Lock`, …); if no
     exact match, pick the closest lucide icon. Icon props: `stroke={n}` → `strokeWidth={n}`,
     `size` unchanged. For an icon passed as a value/type, type it `LucideIcon`
     (`import { X, type LucideIcon } from 'lucide-react'`).
   - Any example logo (`@mantinex/mantine-logo` `MantineLogo`, a local `Logo`/`Logo.tsx`) →
     `import { Wordmark } from '@/components/Wordmark'` and render `<Wordmark name={m.app__name()} />`.

2. **i18n — every user-facing string becomes a message**
   - `import { asI18n, m } from '@/i18n/messages'`
   - Hardcoded UI copy (labels, titles, button text, placeholders, descriptions, nav items,
     FAQ Q&A, feature blurbs) → `m.<slug>__<key>()` where `<slug>` = lowercase block name
     (e.g. `herotext__title`). Add EVERY key to `meta.i18nKeys` with its English value.
   - Opaque data that is not translatable (people's names, emails, usernames, version strings
     like `v3.1.2`, sample metric values) → `asI18n('...')`.
   - `@pikku/mantine`-overridden components (`Text`, `Title`, `Button`, `Anchor`, `Badge`,
     `Alert`, `Modal`, all inputs, `Menu.Item`, `Tabs.Tab`, `NavLink`, `Tooltip`…) type their
     text props as `I18nNode`/`I18nString` and will REJECT a raw string — that's the gate.
     Pass `m.*()` / `asI18n()` there. A plain `<div>`/`<a>`/`<span>` won't error, but its text
     must STILL be `m.*()` — no hardcoded English anywhere.

3. **CSS module — kept, but STRICT.** A `.module.css` may contain ONLY:
   - layout/structure (flex, grid, gap, position, aspect-ratio, transitions)
   - state/pseudo via plain selectors: write `.foo:hover { }` as its OWN rule (do NOT use
     `@mixin hover` — convert it). `::before`/`::after` decorative only.
   - `@media` using `--mantine-breakpoint-*`
   - values ONLY as: `var(--mantine-color-*|spacing-*|radius-*|font-size-*|shadow-*)`,
     `light-dark(var(...), var(...))`, the native `rem` unit, or `calc()` over those.
     BANNED (a converter must eliminate these): literal colors (`#hex`, `rgb()`, named) → use a
     `--mantine-color-*` var; `px` literals → `rem` unit or a token; `@mixin ...` → plain CSS;
     `content:` containing words; `!important`; `:root`/global selectors; `font-family`.
     Convert the source's `@mixin hover { X }` → `.sel:hover { X }`, and drop demo-only fixed
     sizes (e.g. `height: 800px` on a shell) to something real (`100dvh`/`100%`).

4. **Data-driven components take props.** If a block renders a specific user/row/item
   (UserButton, tables with mock rows, stat cards with a number), lift that to props typed
   `I18nString`/`number`/`string` — how a real app passes live data. Keep a small sample in
   the exported wrapper via `asI18n(...)`. For page SECTIONS (hero, features, faq, footer)
   keep the sample copy inline as `m.*()` keys so it's translatable by default.

5. **Component signature:** `export function <Name>() {}` for the top block; `export const
<Sub>: FC<Props> = () => {}` for props-driven sub-components. Match the reference.

6. **External demo images/avatars:** an image URL is opaque, not UI copy — keep a sample URL
   inline as a plain string, or make it a prop. Never wrap image URLs in `m.*()`.

## meta.json schema

```json
{
  "name": "HeroText",
  "title": "short human label",
  "description": "one sentence: what it is + when to use it (this prints in `blocks list`)",
  "tags": ["heroes"],
  "files": ["HeroText.tsx", "HeroText.module.css"],
  "dependsOn": [],
  "npmDeps": [],
  "i18nKeys": { "herotext__title": "…", "herotext__cta": "…" }
}
```

- `tags`: use the ONE category tag this block belongs to (see the batch you were assigned).
- `npmDeps`: extra npm packages beyond what the template already has (`@pikku/mantine`,
  `@mantine/core`, `@mantine/hooks`, `lucide-react`, `@tanstack/*`). lucide/hooks are already
  present → do NOT list them. Only list genuinely-extra deps (e.g. a dnd lib for DndTable).
- `internal: true` on sub-components that are only ever composed (not picked directly).

## Verify your own work before finishing

- No `@mantine/core`, `@tabler/`, `MantineLogo`, or hardcoded English string literals remain
  in the `.tsx`.
- Every `m.<slug>__*` you call is present in `meta.i18nKeys`.
- The `.module.css` has no hex/rgb/named color, no `px` literal, no `@mixin`.
