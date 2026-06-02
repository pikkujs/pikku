---
name: pikku-rtl
description: 'Make a Pikku frontend work in both English (LTR) and Arabic / right-to-left languages. Direction is derived from the active locale, applied once at the document root, and the layout mirrors itself — but only if styling is written flow-relative (margin-inline-start, text-align: start, Mantine ms/me) instead of left/right. TRIGGER when: adding Arabic (or Hebrew/Farsi/Urdu), asked to "support RTL / right-to-left / bidi / mirror the layout", or writing layout styles in an app that may run RTL. Builds on pikku-i18n (an RTL language is just another locale file). DO NOT TRIGGER for backend functions or for LTR-only copy changes.'
installGroups: [core]
---

# Pikku RTL (Arabic + English)

This skill sits **on top of** `pikku-i18n`. That skill maps a locale to `t()`
tokens; this one adds the second axis: a locale also has a **direction**.
Arabic is not special-cased — it is just another locale file (`ar.json`,
registered `satisfies typeof en`) plus the document being told it is `rtl`.

## The one idea

Set `dir` **once at the document root** from the active locale, then let the
browser and Mantine mirror everything — _provided_ every custom style is written
**flow-relative** (start/end), never **physical** (left/right). Get those two
things right and Arabic, Hebrew, Farsi and Urdu all work with zero per-component
RTL code.

## Agent Operating Procedure

1. **Tokens first.** Every visible string is already a `t()` token via
   `pikku-i18n`. Arabic copy goes in `i18n/ar.json`, mirroring `en.json`'s keys,
   registered with `satisfies typeof en` so a missing key is a compile error.
2. **Add the direction helper** to the i18n config (one home for locale→dir):
   ```ts
   const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur'])
   export function localeDir(locale: string = defaultLocale): 'rtl' | 'ltr' {
     return RTL_LOCALES.has(locale.split('-')[0]) ? 'rtl' : 'ltr'
   }
   ```
   (The bundled templates already ship this helper — use it, don't reinvent it.)
3. **Apply `dir` + `lang` at the root**, once, from the active locale — pick the
   recipe for your framework below.
4. **Write every layout style flow-relative.** This is the part that actually
   makes mirroring work; see the rules. When editing existing UI to be
   RTL-ready, the job is mostly a search-and-replace of physical properties.
5. **Flip directional icons** (chevrons, back/forward arrows) — the one thing
   logical properties can't do for you.
6. Validate with the app's `tsc`, then load `?i18n-debug` / set `dir` and
   eyeball that the layout mirrors and nothing is stuck on the wrong edge.

## Flow-relative, not physical — the rules that make it mirror

Use the **inline-axis logical** property; never the physical one:

| Don't (physical)             | Do (flow-relative)                           |
| ---------------------------- | -------------------------------------------- |
| `margin-left` / `marginLeft` | `margin-inline-start` / `marginInlineStart`  |
| `margin-right`               | `margin-inline-end` / `marginInlineEnd`      |
| `padding-left/right`         | `padding-inline-start/end`                   |
| `left: 0` / `right: 0`       | `inset-inline-start: 0` / `inset-inline-end` |
| `text-align: left/right`     | `text-align: start / end`                    |
| `border-top-left-radius`     | `border-start-start-radius`                  |
| `float: left/right`          | `float: inline-start / inline-end`           |

In **Mantine**, use the logical style props — they emit the logical CSS above:

| Don't       | Do          |
| ----------- | ----------- |
| `ml` / `mr` | `ms` / `me` |
| `pl` / `pr` | `ps` / `pe` |

Mantine's own components already use logical properties internally, so once the
direction is set they mirror automatically — you only have to be disciplined in
**your** styles.

**Leave flexbox and grid alone.** `display:flex` already follows `dir`:
`justify-content: flex-start` resolves to the right edge under RTL on its own.
Never "fix" RTL by swapping to `flex-direction: row-reverse` or reordering DOM —
that double-flips and breaks the moment direction changes. The DOM order is
logical order; let `dir` handle the visual order.

## Applying direction at the root

### Mantine app (e.g. environment-template)

Mantine ships first-class RTL: wrap the tree in `DirectionProvider` and set the
matching `dir` on `<html>`.

```tsx
import { DirectionProvider, MantineProvider } from '@mantine/core'
import i18n, { detectLocale, localeDir } from './i18n/config'

const locale =
  typeof window !== 'undefined' ? detectLocale(window.location.pathname) : 'en'
const dir = localeDir(locale)

if (typeof document !== 'undefined') {
  document.documentElement.lang = locale
  document.documentElement.dir = dir // Mantine + browser read this
}

root.render(
  <DirectionProvider initialDirection={dir}>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {/* …app… */}
    </MantineProvider>
  </DirectionProvider>
)
```

To flip direction live (a language switcher) call
`document.documentElement.setAttribute('dir', localeDir(next))` and Mantine's
`useDirection().setDirection(dir)`; both read the same value.

### Plain Vite SPA (kanban, test-harness vite-spa)

No Mantine — just put `dir`/`lang` on `<html>` at bootstrap, after the locale is
detected (the same `detectLocale` the i18n config uses):

```ts
import { detectLocale, localeDir } from './i18n/config'

const locale = detectLocale(window.location.pathname)
document.documentElement.lang = locale
document.documentElement.dir = localeDir(locale)
```

Everything below inherits `dir` from `<html>`; logical CSS does the mirroring.

### Vite SSR (test-harness vite-ssr)

The worker renders the full HTML, so set `lang`/`dir` on the server `<html>`
from the **URL** locale (the client inherits it on hydration — no flash):

```tsx
import { detectLocale, localeDir } from './i18n/config'

const locale = detectLocale(new URL(request.url).pathname)
const dir = localeDir(locale)
const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
  …
</html>`
```

i18next's active language must match: call `i18n.changeLanguage(locale)` before
`renderToString` so the SSR'd text and `dir` agree.

### Next.js app-router (test-harness next-ssr / next-static)

Set it on the `<html>` in `app/layout.tsx`. With locale-prefixed routes the
segment gives the locale; for a single-locale build it's a constant:

```tsx
import { localeDir, defaultLocale } from './i18n/config'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = defaultLocale // or the [lang] route segment / params
  return (
    <html lang={locale} dir={localeDir(locale)}>
      <body>{children}</body>
    </html>
  )
}
```

For `output: 'export'` with `/ar` prefixes, derive `locale` from the route
segment so each statically-exported tree carries the right `dir`.

## Directional icons — the manual bit

Logical properties mirror box layout, **not glyphs**. An icon that points
somewhere (chevron, back/next arrow, send, undo) must flip under RTL; a
non-directional icon (search, settings, avatar) must **not**. Flip with the
`:dir()` selector — no JS, no per-locale branching:

```css
:dir(rtl) .icon-directional {
  transform: scaleX(-1);
}
```

Or in CSS-in-JS / inline, gate on the resolved direction:
`transform: localeDir(locale) === 'rtl' ? 'scaleX(-1)' : undefined`.
Prefer logical icon components if your icon set ships them.

## Arabic typography niceties

- **Font:** the default Latin stack renders Arabic with the system fallback,
  which is inconsistent. Add an Arabic-capable family (e.g. _Noto Sans Arabic_,
  _IBM Plex Sans Arabic_) to `font-family` so both scripts look intentional.
- **Numerals:** don't hardcode digits. Format numbers/dates with
  `Intl.NumberFormat`/`Intl.DateTimeFormat` (or i18next formatters) given the
  active locale, so Western vs Arabic-Indic digits follow the locale choice.
- **Line height:** Arabic diacritics sit tall — a slightly larger `line-height`
  on Arabic body text avoids clipping. Keep it locale-scoped, not global.

## Adding Arabic to an existing app — checklist

1. `i18n/ar.json` mirroring `en.json`; register
   `ar: { translation: ar satisfies typeof en }` and add `'ar'` to
   `supportedLocales`. (Type-complete or it won't compile — the deploy blocks.)
2. Confirm the `localeDir` helper includes `ar` (it does by default).
3. Confirm the root sets `dir` from the locale (recipe above).
4. Sweep the app's styles: replace every `left/right`, `ml/mr`, `text-align:
left` with the flow-relative equivalent; revert any manual `row-reverse`.
5. Flip directional icons.
6. `tsc`, then load the Arabic route and verify the whole layout mirrors —
   sidebar on the right, text right-aligned, arrows pointing the other way.

## What NOT to do

- Don't use physical `left`/`right` (or `ml`/`mr`) in any new layout style — even
  in an English-only app. Writing logical from the start is the seam Arabic
  slots into, exactly like tokens are for copy.
- Don't fake RTL with `flex-direction: row-reverse`, reversed DOM order, or
  per-locale `if (rtl)` layout branches. Set `dir` once; let layout follow.
- Don't set `dir` on individual components — it belongs on `<html>` so the whole
  document (and Mantine) agrees.
- Don't translate Arabic copy outside the `t()` token system; an RTL language is
  a normal locale, governed by `pikku-i18n`.
