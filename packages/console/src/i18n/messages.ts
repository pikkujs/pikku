// Typed message functions for the app. `m.landing_title()` returns a branded
// I18nString, so it satisfies the @pikku/mantine i18n gate exactly where the old
// `t('landing.title')` used to — no call-site boilerplate.
//
// Each message is wrapped once so i18n-debug masking (█) still works (parity with
// the old i18next postProcessor). Wrapping the whole namespace forgoes Paraglide
// per-message tree-shaking — fine here: locale files are KB and the app bundled
// all of en.json under i18next anyway.
import { m as _m } from '../paraglide/messages.js'
import type { I18nString } from '@pikku/react'
import { maskI18n } from './config.js'

type BrandReturn<T> = T extends (...args: infer A) => unknown ? (...args: A) => I18nString : T
type Branded<T> = { [K in keyof T]: BrandReturn<T[K]> }

const _raw = _m as unknown as Record<string, (args?: Record<string, unknown>) => string>
const _wrapped: Record<string, unknown> = {}
for (const key of Object.keys(_raw)) {
  const fn = _raw[key]
  _wrapped[key] = typeof fn === 'function' ? (...args: unknown[]) => maskI18n((fn as (...a: unknown[]) => string)(...args)) : fn
}

/**
 * Branded, debug-maskable message namespace — the only way to reach a message.
 *
 * There is deliberately no runtime key resolver: a computed key defeats the
 * type checker, so a renamed or deleted message degrades to a console warning
 * in the browser instead of a build failure. Where the key is genuinely dynamic,
 * map the discriminant to a message function at the call site — the map is
 * checked, a string is not.
 */
export const m = _wrapped as unknown as Branded<typeof _m>
