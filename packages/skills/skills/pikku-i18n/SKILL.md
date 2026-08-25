---
name: pikku-i18n
description: 'Wire i18n into a Pikku frontend with Paraglide JS (inlang). English by default, every user-facing string is a typed message function (`m.some__key()`) compiled from `messages/<locale>.json`, and additional languages are served under `/fr` `/de` URL prefixes. TRIGGER when: scaffolding or editing a frontend and writing user-facing text, adding a second language, or asked to "make this translatable / use tokens / add i18n". DO NOT TRIGGER for backend functions, error messages thrown from functions, or log output.'
installGroups: [client, fabric]
---

# Pikku i18n (Paraglide JS)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Every user-facing string in a frontend is a message. Never hardcode display text — add a key to `messages/en.json` and render `m.the__key()`. This holds even when the app ships only English; the messages are the seam a second language slots into later.
2. One `messages/<locale>.json` per language at the app root (NOT under `src/`), declared in `project.inlang/settings.json`. English (`en`) is `baseLocale` and the only locale until someone adds another. **`baseLocale` stays `en` whatever language the product speaks** — see [The product's language is not the code's language](#the-products-language-is-not-the-codes-language), which is the first thing to read if the brief says the app is not in English.
3. Messages compile to typed ESM functions in `src/paraglide/` (generated, self-gitignored — never edit or commit it). The Vite plugin compiles during `dev`/`build` with HMR on message edits; run the CLI compile only when you need `tsc` before Vite has ever run.
4. Validate with the app's own `tsc` then its `build`. The deploy pipeline compiles Paraglide and runs each frontend's `tsc` before building it — an i18n mistake blocks the deploy.

## The product's language is not the code's language

A brief that says "the entire UI is German, no English strings visible anywhere"
is a statement about **one** of three separate things, and reading it as a
statement about the codebase is the single most expensive mistake available in
this skill. Three axes:

| Axis            | What it covers                                                                                          | What sets it                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Identifiers** | Function, component, type and file names; database tables and columns                                   | Nothing — always English, no setting                            |
| **Meta**        | `description` / `name` / `title` / `template` authored inside the code, which the Pikku Console renders | `locale` in `pikku.config.json`, default `en`                   |
| **Product UI**  | Every string the app shows a user                                                                       | `messages/<locale>.json` + `defaultLocale` — **this axis only** |

A non-English product moves the third row and nothing else.

### `baseLocale` stays `en`

`baseLocale` in `project.inlang/settings.json` does not mean "the language the
app is in". It names the message **source** — the catalogue every other locale is
cloned from and translated against. Setting it to the product's language looks
like it works, because the app does come up in that language, and then:

- there is no `en.json`, so `--add-locale` has no catalogue to translate from
- the app can never gain a second language without re-authoring every key
- a message missing from a locale falls back to a catalogue nobody wrote

The setting that actually decides what a first-time visitor sees is
`defaultLocale`, held in `apps/app/src/i18n/active.json` in the Fabric app
template and read by `src/i18n/config.ts`. It is deliberately a separate file
from `settings.json` for exactly this reason — the source language and the
served language are different questions.

So a German medical portal is **three** settings, not one:

```jsonc
// project.inlang/settings.json — the source catalogue is English
{ "baseLocale": "en", "locales": ["en", "de"] }

// apps/app/src/i18n/active.json — what a visitor opens in
{ "defaultLocale": "de" }

// pikku.config.json — the language the team reads their Console in
{ "locale": "de" }
```

In the Fabric template both of the first two have a command, so you rarely edit
them by hand:

```sh
fabric i18n --add-locale de       # adds "de" to locales, seeds messages/de.json from en.json
fabric i18n --default-locale de   # writes active.json — the app now OPENS in German
```

### The failure this is written from

A real build, from this template. The brief said the UI was German; the agent
set `baseLocale: "de"` with `locales: ["de"]` and no `en.json`, then carried the
same reading into the code — RPC functions `getUebersicht` and
`getPatientendetail`, components `Zeitstrahl` and `AufmerksamkeitStreifen`,
helpers `datumDeutsch` and `voraussichtlichFertig`, database tables `vorgang`
and `ereignis` with German columns.

The German UI it was asked for needed none of that. It needed German **values**
in a catalogue whose keys and source stayed English. What it got instead was a
project that cannot add a second language and cannot be picked up by anyone who
does not read German.

If you find a project in this state, say so plainly rather than working around
it: `baseLocale` cannot be repointed without re-keying every message, so it is a
migration someone has to agree to, not a fix to slip in.

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

A DB value picking a label is the one case a generated message can't express.
Paraglide's README (§ "What about dynamic or CMS-driven keys?") is explicit: use
an **explicit mapping from value to message function**. Key it on the enum type,
never `string`:

```ts
import { m } from '../paraglide/messages.js'

const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, () => string> = {
  completed: m.enum__document_status__completed,
  in_progress: m.enum__document_status__in_progress,
  required: m.enum__document_status__required,
}

// call site — no fallback, because there is no missing case
DOCUMENT_STATUS_LABEL[status]()
```

`Record<DocumentStatus, …>` is exhaustive: add a value to the enum without a
label and the build fails. That is the entire point.

**Don't write these maps by hand.** `@pikku/paraglide` generates them from the
`enum__<group>__<member>` keys in the catalog and types each one against the DB
enum it mirrors, so a migration adding a status is a compile error rather than a
map someone forgot. Use the namespace above (singular `enum`, `__` between
segments) so the generator picks the group up, and read `pikku-paraglide` before
adding one.

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
2. Add `"fr"` to `locales` in `project.inlang/settings.json`. **Leave `baseLocale` at `en`** — step 1 only works because there is an English catalogue to mirror.
3. Recompile (restart/`vite dev` or the CLI compile). A locale file missing keys falls back to the base locale per message.
4. Content is reachable via the `/<lang>` URL prefix (`detectLocale` already resolves it); the base locale needs no prefix. Expose the switcher via `useLocale().setLocale`.
5. Only if the app should **open** in the new language rather than merely offer it: set `defaultLocale` (`active.json` / `fabric i18n --default-locale fr`). Adding a locale and changing the default are different asks — do the second only when asked.

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
- Don't set `baseLocale` to anything but `en`, whatever language the product speaks. It names the source catalogue, and a project without one can never add a language. Set `defaultLocale` instead.
- Don't let a non-English UI reach the identifiers. Functions, components, types, files, tables and columns are English in every project; the product's language lives in `messages/*.json` and nowhere else.
- Don't translate message **keys**. `auth__login__title` stays English in `de.json`; only the value changes.
- Don't edit or commit anything under `src/paraglide/` — it's regenerated; change `messages/*.json` instead.
- **Don't wrap `m`.** No re-export module, no branding layer, no resolver. Components import `m` from `../paraglide/messages.js` and call it. `@pikku/react`'s `I18nString` is declared as `string & { readonly __brand: 'LocalizedString' }` — deliberately identical to Paraglide's own `LocalizedString` — so `m.some__key()` satisfies the `@pikku/mantine` `I18nNode` gate natively. A wrapper adds nothing and costs per-message tree-shaking.

  `packages/console` is the one place in this repo that still wraps it, in `src/i18n/messages.ts`, to keep the debug mask (`█`) it carried over from i18next. That wrapper is a leftover, not a pattern — the generated-locale approach above is how a new app gets the same masking without touching every export. Don't copy it.

  The `mKey`/`mList` runtime resolvers that used to live beside it are **gone**, and must not come back. `mList` resolved indexed `prefix.0` keys that no longer exist; `mKey` took a computed string, which is exactly the type safety Paraglide exists to provide. Where a key really is dynamic, map the discriminant to a message _function_ and call it — the map is type-checked, a string is not.

- Don't re-resolve messages by string key or re-implement `{param}` interpolation. A key-string resolver turns a missing key back into silent runtime text, surrendering the type safety that is the entire reason to use Paraglide.
- Don't reach for i18next/react-i18next or a runtime-fetch translation loader — Paraglide's compiled functions are the whole delivery mechanism.
- Don't tokenize backend error messages or logs here — those are not frontend display strings.
