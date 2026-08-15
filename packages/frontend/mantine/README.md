# @pikku/mantine

A drop-in for [`@mantine/core`](https://mantine.dev) with i18n-tightened types —
**zero runtime added**. Every string-bearing prop (`children`, `label`,
`placeholder`, `title`, `aria-label`, …) is narrowed from `string` to the branded
`I18nString` / `I18nNode` from [`@pikku/react`](../react), so untranslated literals
fail to compile.

```tsx
// before — plain Mantine compiles this
import { Button } from '@mantine/core'
;<Button>Save</Button>

// after — @pikku/mantine rejects the raw string
import { Button } from '@pikku/mantine/core'
import { m } from '@/i18n'
;<Button>{m.actions_save()}</Button> // ✅ branded
;<Button>Save</Button> // ❌ type error
```

`I18nString` is structurally Paraglide JS's `LocalizedString`, so a Paraglide
`m()` message satisfies the gate natively — your app owns the locale store and
`@pikku/react` only owns the brand.

Aliasing `@mantine/core` → `@pikku/mantine/core` (e.g. via build-time resolution)
therefore turns the whole app into a strict translation gate. Use `asI18n()` from
`@pikku/react` as a deliberate escape hatch for dynamic, non-i18n strings (server
errors, user content).

## Install

```sh
yarn add @pikku/mantine @pikku/react
# peers: @mantine/core@^8 || ^9, react
```

## `@pikku/mantine/dev`

A second entry point for development-only controls. It is deliberately separate
from `/core`: that one's contract is "drop-in alias for `@mantine/core`", so it
must not export components Mantine has no counterpart for.

`<DevActorSwitcher />` is the one-click "Sign in as …" control — it signs in as
any declared scenario persona with no password, so an app can be reviewed as each
kind of user. `pikku fabric validate` requires any frontend with a login screen
to ship one, since without it a reviewer is locked out of their own sandbox.

```tsx
import { DevActorSwitcher } from '@pikku/mantine/dev'
;<DevActorSwitcher
  actors={import.meta.env.DEV ? import.meta.env.VITE_DEV_ACTORS : undefined}
  secret={
    import.meta.env.DEV ? import.meta.env.VITE_SCENARIO_ACTOR_SECRET : undefined
  }
  apiUrl={apiUrl()}
  onSignedIn={() => navigate({ to: '/' })}
/>
```

The sandbox dev server bakes both env vars from your declared personas; neither
is set in production, so the control renders `null` there. Gate the reads on your
bundler's dev flag as above so the secret never reaches a production bundle.

It takes `onSignedIn` rather than depending on a router — every app lands
somewhere different. For custom UI, build on `useDevActors()` from
[`@pikku/react`](../react) instead; this component is only its default rendering.

## How it works

The package re-exports the real Mantine component _values_ and only re-casts their
_types_. Polymorphism (`component="a"`), compound statics (`Menu.Item`,
`Tabs.List`, `Menu.Divider`, …) and every other Mantine feature are preserved —
see `src/core/helpers.ts` for the type machinery and `src/core/i18n.test-d.tsx`
for the enforced positive/negative contract (`yarn test`).
