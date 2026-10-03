// Typed message functions for the app. `m.landing_title()` returns a branded
// I18nString, so it satisfies the @pikku/mantine i18n gate with no call-site
// boilerplate.
//
// Each message is wrapped once so i18n-debug masking (█) still works. Wrapping
// the whole namespace forgoes Paraglide per-message tree-shaking — fine here:
// locale files are KB and the whole catalogue is small enough to ship.
import { m as _m } from '../paraglide/messages.js'
import type { I18nString } from '@pikku/react'
import { maskI18n } from './config.js'

type BrandReturn<T> = T extends (...args: infer A) => unknown ? (...args: A) => I18nString : T
type Branded<T> = { [K in keyof T]: BrandReturn<T[K]> }

const _raw = _m as unknown as Record<string, (args?: Record<string, unknown>) => string>
const _wrapped: Record<string, unknown> = {}
for (const key of Object.keys(_raw)) {
  const fn = _raw[key]
  _wrapped[key] =
    typeof fn === 'function'
      ? (...args: unknown[]) => maskI18n((fn as (...a: unknown[]) => string)(...args))
      : fn
}

/** Branded, debug-maskable message namespace — the only way to reach a message. */
export const m = _wrapped as unknown as Branded<typeof _m>

// Re-export asI18n so every call site imports BOTH i18n helpers from this one
// module — `import { asI18n, m } from '@/i18n/messages'`. asI18n brands an opaque
// runtime string (a server name/slug/id or a formatted date/number) so it passes
// the @pikku/mantine i18n gate; m.key() is for static copy. Keep them co-located.
export { asI18n } from '@pikku/react'
