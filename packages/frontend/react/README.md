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

## Docs

https://pikku.dev/docs
