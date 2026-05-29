---
name: pikku-i18n
description: 'Wire i18n into a Pikku frontend (Vite SPA, Vite SSR, or Next.js app-router) with react-i18next + i18next. English by default, every user-facing string goes through a `t()` token, and additional languages are served under `/de` `/es` URL prefixes. TRIGGER when: scaffolding or editing a frontend and writing user-facing text, adding a second language, or asked to "make this translatable / use tokens / add i18n". DO NOT TRIGGER for backend functions, error messages thrown from functions, or log output.'
installGroups: [core]
---

# Pikku i18n

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Every user-facing string in a frontend is a token. Never hardcode display text — write `t('some.token')` and put the English copy in `i18n/en.json`. This holds even when the app ships only English; the tokens are the seam a second language slots into later.
2. One `i18n/<lang>.json` file per language per app, sitting next to the i18n config in a single `i18n/` folder. English (`en`) is the default and is the only locale registered until someone adds another.
3. Pick the delivery pattern by framework (see below). The token files and config shape are identical across frameworks; only *how the active locale reaches the renderer* differs.
4. Validate with the app's own `tsc` then its `build`. For Next.js, a clean `dev` is not enough — run `build`, because the RSC page-data collection step is where i18n wiring mistakes surface.

## The rules that don't change

- Library: `react-i18next` + `i18next`. Nothing else.
- Locale files live next to the config in an `i18n/` folder — `src/i18n/<lang>.json` (Vite) or `app/i18n/<lang>.json` (Next.js) — imported statically. **Do not** put them under `public/` — Vite cannot `import` from `public/`, and a runtime fetch is unnecessary: UI-string files are a few KB, so static-import every locale and move on. Do not reach for `i18next-http-backend`, lazy `import()`, or per-locale code-splitting.
- Default locale is `en`. Adding a language = drop `i18n/<lang>.json`, import + register it in the config, done. Its content is then served under the `/<lang>` URL prefix; the default locale needs no prefix.
- Keys are namespaced by area (`auth.login.title`, `board.createCta`). Interpolate with `{{name}}` and pass `t('key', { name })`.

## Config shape (client / SPA)

`src/i18n/config.ts`:

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

export const supportedLocales = ['en'] as const
export type Locale = (typeof supportedLocales)[number]
export const defaultLocale: Locale = 'en'

export function detectLocale(pathname: string): Locale {
  const segment = pathname.split('/')[1]
  if (supportedLocales.includes(segment as Locale)) return segment as Locale
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language?.split('-')[0]
    if (supportedLocales.includes(lang as Locale)) return lang as Locale
  }
  return defaultLocale
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: typeof window !== 'undefined' ? detectLocale(window.location.pathname) : defaultLocale,
  fallbackLng: defaultLocale,
  interpolation: { escapeValue: false },
})

export default i18n
```

Import it once for its side effect at the app entry (`import './i18n/config'` in `main.tsx`), then use the hook in components:

```tsx
import { useTranslation } from 'react-i18next'
function Page() {
  const { t } = useTranslation()
  return <h1>{t('landing.title')}</h1>
}
```

Non-component helpers (formatters, status maps) can't use the hook — import the instance and call it directly:

```ts
import i18n from '../i18n/config'
export const prettyStatus = (s: string) => i18n.t(`status.${s}`)
```

## Per-framework delivery

### Vite SPA
The config above is the whole story. `import './i18n/config'` in `main.tsx`; `useTranslation` everywhere.

### Vite SSR (`@cloudflare/vite-plugin` / Worker)
Same config, but `import './i18n/config'` in **both** the worker entry (`worker.tsx`) and the client entry (`client.tsx`) so the global i18next instance is initialised on each side before `<App/>` renders. The locale JSON is bundled into the Worker (a static import, not a fetch — the Worker never has to fetch its own assets). The shared `<App/>` uses `useTranslation` normally.

### Next.js app-router — server components
Server components **cannot** call `useTranslation`, and they **must not** import `initReactI18next`: it calls React's `createContext`, which throws during RSC page-data collection (`(0 , Y.createContext) is not a function` at build). Use a plain i18next instance and a fixed translator instead.

`app/i18n/config.ts`:

```ts
import { createInstance } from 'i18next'
import en from './en.json'

export const supportedLocales = ['en'] as const
export type Locale = (typeof supportedLocales)[number]
export const defaultLocale: Locale = 'en'

const i18n = createInstance()
i18n.init({
  resources: { en: { translation: en } },
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  interpolation: { escapeValue: false },
})

export function getT(locale: Locale = defaultLocale) {
  return i18n.getFixedT(locale)
}

export default i18n
```

```tsx
import { getT } from './i18n/config'
export default function Page() {
  const t = getT()
  return <h1>{t('page.title')}</h1>
}
```

This works in both `output: 'export'` (static) and dynamic SSR — the static export pre-renders translated HTML at build time.

### Next.js app-router — client components
A `'use client'` component that needs the hook uses the standard `initReactI18next` instance behind an `I18nextProvider`, kept separate from the server `app/i18n/config.ts`. Most starter pages are server components and never need this.

## Adding a second language

1. `i18n/de.json` mirroring `en.json`'s keys.
2. In the config: `import de from './de.json'`, add `'de'` to `supportedLocales`, add `de: { translation: de }` to `resources`.
3. `detectLocale` already resolves `/de/...`; wire the locale segment into routing so `/de` renders the German tree (the default locale stays prefix-free).

## What NOT to do

- Don't hardcode display strings "just for now" — that defeats the point; the token is the work.
- Don't put locale files under `public/` or fetch them at runtime.
- Don't wire `initReactI18next` into a Next.js server component or any module a server component imports.
- Don't tokenize backend error messages or logs here — those are not frontend display strings.
