# @pikku/react

React bindings for Pikku — a provider plus hooks for fetch, RPC, AI agents,
workflows and realtime channels.

Also owns the `I18nString` brand that `@pikku/mantine` uses to reject
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

`useDevActors()` powers the dev-only "Sign in as …" switcher: one click signs in
as a declared scenario persona with no password, through Better Auth's actor
endpoint. It is UI-free, so you can render it however you like — or use the
ready-made `<DevActorSwitcher />` from `@pikku/mantine/dev`.

```typescript
import { useDevActors } from '@pikku/react'

const { actors, signInAs, isPending } = useDevActors({
  // The sandbox dev server bakes these from your declared personas. Gate the
  // reads on your bundler's dev flag so the secret never reaches production.
  actors: import.meta.env.DEV ? import.meta.env.VITE_DEV_ACTORS : undefined,
  secret: import.meta.env.DEV
    ? import.meta.env.VITE_SCENARIO_ACTOR_SECRET
    : undefined,
  apiUrl: apiUrl(),
  onSignedIn: () => navigate({ to: '/' }),
})
```

`actors` is empty unless the host supplied both a list and a secret, so a
production build renders nothing without you testing for it. The endpoint only
accepts users flagged `actor: true`, so it can never impersonate a real user.

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

## Docs

https://pikku.dev/docs
