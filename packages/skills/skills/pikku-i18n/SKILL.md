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
- `src/i18n/config.ts` — locale plumbing, and the ONLY hand-written i18n module: `supportedLocales`/`defaultLocale` (re-exported from `../paraglide/runtime.js`), `detectLocale`, `localeDir` (RTL for ar/he/fa/ur), a reactive locale store (`overwriteGetLocale` bridged to `useSyncExternalStore`), `setActiveLocale`, `useLocale()`. This is not a wrapper over messages — Paraglide's `getLocale()` is a module global with no React reactivity, and this bridges it. Wire `overwriteGetLocale` or `m.*()` will resolve a different locale than the app thinks is active.
- `tsconfig.json` — `"allowJs": true, "checkJs": false` so `tsc` can consume Paraglide's JSDoc-typed JS output.

## Using messages in components

```tsx
import { m } from '../paraglide/messages.js'
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

## Keys only known at runtime (enum labels, status maps)

A DB value picking a label (`enums__document_status__${status}`) is the one case a
generated message can't express. Paraglide's README (§ "What about dynamic or
CMS-driven keys?") is explicit: use an **explicit mapping from value to message
function**. Key it on the enum type, never `string`:

```ts
import { m } from '../paraglide/messages.js'

const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, () => string> = {
  completed: m.enums__document_status__completed,
  in_progress: m.enums__document_status__in_progress,
  required: m.enums__document_status__required,
}

// call site — no fallback, because there is no missing case
DOCUMENT_STATUS_LABEL[status]()
```

`Record<DocumentStatus, …>` is exhaustive: add a value to the enum without a
label and the build fails. That is the entire point.

Do NOT write `Record<string, () => string>` with a `?? status` fallback, and do
NOT index the namespace with a computed key (`m[\`enums__${name}__${value}\`]`).
Both compile, both render the raw identifier to users when a label is missing,
and both reintroduce exactly the silent-fallback failure Paraglide exists to
eliminate. If you find yourself writing a `resolveDynamicKey(key: string)`
helper, stop — that helper IS the bug.

## Type safety — and why deploys block on i18n

A message IS a function: a typo'd or deleted key (`m.auth__login__titel()`) is a missing export — a **TypeScript error**, not a silent runtime fallback string. Params are typed too. The deploy pipeline compiles Paraglide then runs each frontend's `tsc` (`"tsc": "tsc --noEmit"` script — keep it in every frontend's `package.json`) **before** building; a type error aborts the deploy. `vite build` does not type-check on its own, so this gate is the only thing standing between a broken message and production.

The gate catches _invalid_ messages but not _inlined_ strings. The `@pikku/mantine` `I18nNode` prop typing catches those: a raw string literal fails to compile on a gated prop, because `I18nString` is a branded type a bare `string` can't satisfy. Between the two, `tsc` is the whole safety net — there is no runtime fallback to inspect, by design.

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

`tsc` catches invalid messages, and the `@pikku/mantine` gate catches raw strings on gated props — but neither sees a hardcoded string in plain JSX, an `aria-label`, `alt`, `document.title`, or anything passed to a non-Mantine component. Debug mode covers that gap: render every message as block glyphs (`█`), and whatever is still readable never went through a message.

**Build it as a generated locale, never as a runtime wrapper.** Masked text is text, and rendering different text per locale is what Paraglide already does:

1. A script generates `messages/zz.json` from `en.json`, replacing `\S` with `█` while leaving `{placeholders}` intact (they are message inputs — mangling them changes the compiled signature). Run it before `paraglide-js compile`; gitignore the output.
2. Add `"zz"` to `locales` in `project.inlang/settings.json`.
3. Switch to it in the locale bridge:
   ```ts
   overwriteGetLocale(() => (isI18nDebug() ? 'zz' : activeLocale))
   ```

Keep `zz` out of the app's own `supportedLocales` — that drives URL prefixes, hreflang and any backend `locale` param, none of which should see it.

Generate the catalogue in dev only. With `messages/zz.json` absent, Paraglide compiles `zz` to an alias of the base locale (`const zz_x = en_x` — one line per message, no duplicated strings), so a production bundle carries the locale at effectively zero cost.

Both the generator and the store bridge are being upstreamed (pikkujs/pikku#1036, #1035).

The wrapper alternative — a module that walks the namespace and pipes each message through a `mask()` — is what this replaces. It defeats tree-shaking (touching every export), adds a check on every call, and forces every component to import `m` from the wrapper instead of Paraglide.

## What NOT to do

- Don't hardcode display strings "just for now" — the message is the work.
- Don't edit or commit anything under `src/paraglide/` — it's regenerated; change `messages/*.json` instead.
- **Don't wrap `m`.** No re-export module, no branding layer, no resolver. Components import `m` from `../paraglide/messages.js` and call it. `@pikku/react`'s `I18nString` is declared as `string & { readonly __brand: 'LocalizedString' }` — deliberately identical to Paraglide's own `LocalizedString` — so `m.some__key()` satisfies the `@pikku/mantine` `I18nNode` gate natively. A wrapper adds nothing and costs per-message tree-shaking.
- Don't re-resolve messages by string key or re-implement `{param}` interpolation. A key-string resolver turns a missing key back into silent runtime text, surrendering the type safety that is the entire reason to use Paraglide.
- Don't reach for i18next/react-i18next or a runtime-fetch translation loader — Paraglide's compiled functions are the whole delivery mechanism.
- Don't tokenize backend error messages or logs here — those are not frontend display strings.
