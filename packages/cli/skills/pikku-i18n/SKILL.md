---
name: pikku-i18n
description: 'Wire i18n into a Pikku frontend with Paraglide JS (inlang). English by default, every user-facing string is a typed message function (`m.some__key()`) compiled from `messages/<locale>.json`, and additional languages are served under `/fr` `/de` URL prefixes. TRIGGER when: scaffolding or editing a frontend and writing user-facing text, adding a second language, or asked to "make this translatable / use tokens / add i18n". DO NOT TRIGGER for backend functions, error messages thrown from functions, or log output.'
installGroups: [core]
---

# Pikku i18n (Paraglide JS)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Every user-facing string in a frontend is a message. Never hardcode display text — add a key to `messages/en.json` and render `m.the__key()`. This holds even when the app ships only English; the messages are the seam a second language slots into later.
2. One `messages/<locale>.json` per language at the app root (NOT under `src/`), declared in `project.inlang/settings.json`. English (`en`) is `baseLocale` and the only locale until someone adds another.
3. Messages compile to typed ESM functions in `src/paraglide/` (generated, self-gitignored — never edit or commit it). The Vite plugin compiles during `dev`/`build` with HMR on message edits; run the CLI compile only when you need `tsc` before Vite has ever run.
4. Validate with the app's own `tsc` then its `build`. The deploy pipeline compiles Paraglide and runs each frontend's `tsc` before building it — an i18n mistake blocks the deploy.

## The moving parts (starter-template layout)

- `messages/en.json` — flat keys, `{param}` interpolation, inlang message-format:
  ```json
  {
    "$schema": "https://inlang.com/schema/inlang-message-format",
    "auth__login__title": "Sign in",
    "auth__login__description": "Welcome back to {name}."
  }
  ```
  Key convention: lower snake_case, `__` (double underscore) between namespace segments, `_` within a segment — `auth__login__title`, `common__email_placeholder`.
- `project.inlang/settings.json` — `baseLocale`, `locales`, the `@inlang/plugin-message-format` module, `pathPattern: "./messages/{locale}.json"`.
- `vite.config.ts` — `paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide' })` from `@inlang/paraglide-js` (devDependency), FIRST in the plugins array.
- `src/paraglide/` — compiled output (`messages.js`, `runtime.js`, per-locale `messages/*.js`). Generated; it writes its own `.gitignore`.
- `src/i18n/messages.ts` — re-exports the generated `m` wrapped so every message returns a branded `I18nString` (satisfies the `@pikku/mantine` `I18nNode` prop gate) and passes through `maskI18n` for debug mode. **Components import `m` from `@/i18n/messages`, never from `../paraglide/messages.js` directly** — a raw Paraglide call returns a plain `string` and fails the Mantine typing gate.
- `src/i18n/config.ts` — locale plumbing: `supportedLocales`/`defaultLocale` (re-exported from `../paraglide/runtime.js`), `detectLocale`, `localeDir` (RTL for ar/he/fa/ur), a reactive locale store (`overwriteGetLocale` bridged to `useSyncExternalStore`), `setActiveLocale`, `useLocale()`, and the i18n-debug helpers.
- `tsconfig.json` — `"allowJs": true, "checkJs": false` so `tsc` can consume Paraglide's JSDoc-typed JS output.

## Using messages in components

```tsx
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

function LoginPage() {
  useLocale() // subscribe: re-render m.*() when the locale switches
  return (
    <>
      <Title>{m.auth__login__title()}</Title>
      <Text>{m.auth__login__description({ name: m.app__name() })}</Text>
    </>
  )
}
```

- Params: `{name}` in the JSON → `m.auth__login__description({ name })`. Params are typed per message.
- Any component that renders `m.*()` calls `useLocale()` (bare call is enough); it also returns `{ locale, dir, setLocale }` for switchers.
- Non-component helpers (formatters, status maps) call `m.some__key()` directly — the functions are plain ESM, no hook needed; the render-time subscription lives in the component that displays the result.
- Locale switching: the root route persists to localStorage, sets `<html lang dir>` (`localeDir`), and calls `setActiveLocale` — in-SPA re-render, no page reload. Mirror `routes/__root.tsx` in the starter template.

## Type safety — and why deploys block on i18n

A message IS a function: a typo'd or deleted key (`m.auth__login__titel()`) is a missing export — a **TypeScript error**, not a silent runtime fallback string. Params are typed too. The deploy pipeline compiles Paraglide then runs each frontend's `tsc` (`"tsc": "tsc --noEmit"` script — keep it in every frontend's `package.json`) **before** building; a type error aborts the deploy. `vite build` does not type-check on its own, so this gate is the only thing standing between a broken message and production.

The gate catches _invalid_ messages but not _inlined_ strings — the `@pikku/mantine` `I18nNode` prop typing catches those on Mantine props (a raw string literal fails to compile), and i18n-debug covers the rest.

## Compile step

- **Dev/build:** the Vite plugin compiles automatically; editing `messages/*.json` under a running dev server recompiles + HMRs.
- **Standalone `tsc` before Vite has run** (fresh clone, CI):
  ```sh
  npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
  ```
  This is exactly what the deploy CI does before the per-app `tsc`.

## Adding a second language

1. `messages/fr.json` mirroring `en.json`'s keys (translate the values, keep `{param}` names identical).
2. Add `"fr"` to `locales` in `project.inlang/settings.json`.
3. Recompile (restart/`vite dev` or the CLI compile). A locale file missing keys falls back to the base locale per message.
4. Content is reachable via the `/<lang>` URL prefix (`detectLocale` already resolves it); the base locale needs no prefix. Expose the switcher via `useLocale().setLocale`.

## i18n debug mode (find inlined strings)

`src/i18n/messages.ts` wraps every message in `maskI18n`: when enabled, every _translated_ string renders as block glyphs (`█`), so anything still readable on screen never went through a message — a hardcoded string. Off by default. Toggle: `?i18n-debug` in the URL, `localStorage['i18n-debug'] = '1'`, or `I18N_DEBUG=1` for SSR. The starter template wires this; mirror it when hand-wiring a new app.

## What NOT to do

- Don't hardcode display strings "just for now" — the message is the work.
- Don't edit or commit anything under `src/paraglide/` — it's regenerated; change `messages/*.json` instead.
- Don't import `m` from `../paraglide/messages.js` in components — go through `@/i18n/messages` (branding + debug mask).
- Don't reach for i18next/react-i18next or a runtime-fetch translation loader — Paraglide's compiled functions are the whole delivery mechanism.
- Don't tokenize backend error messages or logs here — those are not frontend display strings.
