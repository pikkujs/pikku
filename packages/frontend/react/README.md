# @pikku/react

React bindings for Pikku — a provider plus hooks for fetch, RPC, AI agents,
workflows and realtime channels.

Also owns the `I18nString` brand that the starter template's components use to reject
untranslated string literals at compile time.

## Install

```bash
npm install @pikku/react
```

## Usage

```typescript
import { PikkuProvider, usePikkuRPC, createPikku } from '@pikku/react'

const pikku = createPikku(PikkuFetch, PikkuRPC, options)

const App = () => (
  <PikkuProvider pikku={pikku}>
    <Todos />
  </PikkuProvider>
)

const Todos = () => {
  const { data } = usePikkuRPC('getTodos', {})
  return <List items={data} />
}
```

## Dev actor sign-in

`useDevActors()` powers the "Sign in as …" switcher: one click signs in as a
declared scenario persona with no password, through Better Auth's persona
endpoint. It is UI-free, so you can render it however you like — or use the
starter template's `<DevActorSwitcher />`.

```typescript
import { useDevActors } from '@pikku/react'

const { actors, signInAs, isPending } = useDevActors({
  apiUrl: apiUrl(),
  app: appSlug,
  onSignedIn: () => navigate({ to: '/' }),
})
```

No credential reaches the bundle. The hook lists personas from
`/auth/sign-in/personas`, and `signInAs(id)` posts only the persona id to
`/auth/sign-in/persona`. The server decides both: pass `personaSignIn` to
`pikkuActor` from `@pikku/better-auth`. They offer nobody outside `pikku dev` unless a
stage opts into actor sign-in and turns its `devSwitcher` flag on, and the
endpoint only signs in users flagged `actor: true`, so it can never impersonate
a real user.

## Locale store

`createLocaleStore()` is the reactive locale store a Paraglide frontend needs:
an active locale, a `useSyncExternalStore` hook so messages re-render on switch,
`<html lang>`/`<html dir>` upkeep, and the bridge that points Paraglide's
`getLocale()` at all of it.

```typescript
import { createLocaleStore } from '@pikku/react'
import { overwriteGetLocale } from './paraglide/runtime.js'

export const {
  useLocale,
  setActiveLocale,
  setRouteLocale,
  getLocale,
  localeDir,
  toLocale,
} = createLocaleStore({
  locales: ['en', 'de', 'ar'],
  defaultLocale: 'en',
  storageKey: 'app.language',
  // Passed in, not imported: the runtime is your app's compiled output.
  overwriteGetLocale,
  // Optional — the i18n-debug locale from `@pikku/paraglide`.
  debugLocale: 'zz',
})
```

That bridge is the point. Every compiled message calls Paraglide's own
`getLocale()` to pick a variant, and left alone it resolves through Paraglide's
cookie and URL strategies — which know nothing about your store. An app that has
a store but never calls `overwriteGetLocale` renders one locale while believing
in another.

Two setters, because the app changes locale for two different reasons:
`setActiveLocale` is a user choosing, and persists; `setRouteLocale` is the URL
saying so, and does not.

`detectInitialLocale` defaults to persisted choice → browser language →
`<html lang>` → `defaultLocale`. Pass your own when locale comes from somewhere
else, such as the route or the signed-in user.

## Keeping untranslated text out of the DOM

`I18nString` and `asI18n` make copy a type, but nothing stops `<p>Hello</p>` on its
own. `@pikku/react/i18n-jsx` closes that for plain DOM and SVG elements: it is React's
automatic JSX runtime, unchanged at run time, with a JSX namespace whose intrinsic
elements take `I18nNode` children and `I18nString` text attributes. A bare string
there is a compile error.

Turn it on in a second tsconfig, so the normal build is untouched and the gate is
its own check:

```jsonc
// tsconfig.i18n.json, next to the project's tsconfig.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pikku/react/i18n-jsx"
  }
}
```

Run it with `tsc --noEmit -p tsconfig.i18n.json`. `pikku verify` does this for you:
every directory under `apps/` and `packages/` (up to three levels down, so block libraries and
`packages/addons/*` too) that has a `tsconfig.i18n.json` at its root gets its own gate run, and
every error becomes an `i18n-gate` finding. An error two programs report (a library compiled on
its own and through the app that imports it) is one finding. Putting the same two options
in the main tsconfig also works, and vite/esbuild then load the runtime from the
package (`jsxImportSource` is honoured by both). It needs TypeScript 5.1 or later.

What it rejects:

```tsx
<p>Hello</p>                         // text child
<p>text {m.title()}</p>              // text next to a message is still a string child
<input placeholder="Search" />       // placeholder
<button aria-label="Close" />        // title, alt, label (option, optgroup, track),
                                     // aria-label, aria-description, aria-placeholder,
                                     // aria-roledescription, aria-valuetext
<p>{someReactNode}</p>               // a ReactNode may be a string
```

What it allows: `I18nString` (an `m.*()` message or `asI18n(value)`), numbers,
booleans, `null`, `undefined`, elements, arrays of those, and `cond && <b />`.
`className`, `data-*`, handlers and every other attribute are untouched. A file
that starts with `/** @jsxImportSource react */` opts out (stories, tests).

What it cannot see:

- Fragments: `<>Hello</>` has no props to type.
- `createElement('p', null, 'Hello')` and anything else that skips JSX.
- Components. Their props are whatever their authors declared, so a third-party
  `<Button label="Save" />` is as loose as that library. Type your own components'
  copy props as `I18nString` / `I18nNode` and they are gated the same way.
- `value` and `defaultValue`: they hold user data as often as copy, so they are not gated.
- Numbers: `{3}` is allowed, so a hardcoded count is the author's call.

Separators between translated pieces (`{' · '}`, `{' / '}`, `{'—'}`, `{' '}`) are strings too, and
are not worth a catalogue key. Wrap them in `sep`:

```tsx
import { sep } from '@pikku/react'

<p>{m.owner()}{sep(' · ')}{m.updated()}</p>
```

`sep` takes a literal made only of whitespace, punctuation and symbols (space, no-break and
thin spaces, `. , : ; ! ? · • – — - / \ | ( ) [ ] { } < > « » “ ” ‘ ’ " ' & + = * # @ % ~ ^ _`,
`→ ← ↑ ↓ … ✓ ✕ × € $ £`); words, digits, the empty string, a `string` variable and a template with a
substitution are compile errors, and `pikku verify` reports them as `sep-argument` for code that
bypasses the types. It is not for anything that changes by language: a comma-joined list, "and", a
French space before a colon. Those are a catalogue message, or `Intl.ListFormat` for lists.

The lint checks `jsx-literal-text` and `jsx-literal-prop` cover what is left. They run over
every `apps/*` and `packages/*` directory, and over any deeper directory (to three levels) that
has a `package.json` or a `tsconfig*.json`, such as `packages/addons/spindle`. When the
directory has a `tsconfig.i18n.json` they skip plain DOM elements, which the gate owns, and
keep reporting fragments, components and helper calls such as `say()` and `toast()`.

English written outside JSX is `string-literal-copy` (a warning; an error under
`pikku verify --strict`, like `i18n-stub`). It reads `.ts` and `.tsx` string and template
literals of two or more words that sit where copy lives (object property values, array
elements, return and arrow values, defaults, `?:` / `||` / `??` branches, call arguments and
variable initialisers), and leaves out class names, ids, paths, URLs, code, SQL, `console.*`,
`Error` messages, `m.*`, `asI18n`, `sep`, test helpers, and test, story, scenario, function and
workflow files. Use `m.<key>()`, or `asI18n(variable)` for outside data. It is a heuristic:
prompts for a model and developer-facing labels still show up, so put those folders in
`i18n.ignore` in `pikku.config.json`.

## Photo capture

```tsx
import { usePhotoCapture } from '@pikku/react'

const { photo, open, preparing, error, clear } = usePhotoCapture({ maxEdge: 1024 })

<button onClick={() => open({ camera: true })}>Take a photo</button>
<button onClick={() => open()}>Choose one</button>
{photo ? <img src={photo.dataUrl} /> : null}
```

There is no input to render. `open()` creates one, opens the dialog and throws it
away again — a hidden `<input type="file">` plus a ref plus a change handler is
the same fifteen lines in every app that has ever needed this. `{ camera: true }`
sets `capture="environment"`, which phones honour by opening the rear camera and
desktop browsers ignore, so the same button works while you develop on a laptop.

`photo` is already downscaled: a phone frame is several megabytes and every byte
is paid for more than once — the upload, the row it is stored in, and a vision
model's context window. A model reads a 1024px JPEG as well as it reads a 12MP
one. `photo.data` is base64 with no `data:` prefix, which is what an agent
attachment takes; `photo.dataUrl` is the same bytes ready for an `<img src>`.

Two phone-specific traps are handled: EXIF orientation is applied during decode,
so a portrait photo does not reach the model on its side, and an iPhone HEIC that
`createImageBitmap` refuses falls back to decoding through an `<img>`.

`prepareImage(file, options)` is the same work without the hook, for a file you
already have — a drop target, a paste handler.

## Docs

https://pikku.dev/docs
