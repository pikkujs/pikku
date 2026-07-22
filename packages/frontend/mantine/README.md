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
import { useI18n } from '@pikku/react/i18n'

const { t } = useI18n()
;<Button>{t('actions.save')}</Button> // ✅ branded
;<Button>Save</Button> // ❌ type error
```

Aliasing `@mantine/core` → `@pikku/mantine/core` (e.g. via build-time resolution)
therefore turns the whole app into a strict translation gate. Use `asI18n()` from
`@pikku/react` as a deliberate escape hatch for dynamic, non-i18n strings (server
errors, user content).

## Install

```sh
yarn add @pikku/mantine @pikku/react
# peers: @mantine/core@^8 || ^9, react
```

## How it works

The package re-exports the real Mantine component _values_ and only re-casts their
_types_. Polymorphism (`component="a"`), compound statics (`Menu.Item`,
`Tabs.List`, `Menu.Divider`, …) and every other Mantine feature are preserved —
see `src/core/helpers.ts` for the type machinery and `src/core/i18n.test-d.tsx`
for the enforced positive/negative contract (`yarn test`).
