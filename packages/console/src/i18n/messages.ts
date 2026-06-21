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
import { identOf } from './ident.js'
import { maskI18n } from './config.js'

type BrandReturn<T> = T extends (...args: infer A) => unknown ? (...args: A) => I18nString : T
type Branded<T> = { [K in keyof T]: BrandReturn<T[K]> }

const _raw = _m as unknown as Record<string, (args?: Record<string, unknown>) => string>
const _wrapped: Record<string, unknown> = {}
for (const key of Object.keys(_raw)) {
  const fn = _raw[key]
  _wrapped[key] = typeof fn === 'function' ? (...args: unknown[]) => maskI18n((fn as (...a: unknown[]) => string)(...args)) : fn
}

/** Branded, debug-maskable message namespace. Drop-in for `t('...')`. */
export const m = _wrapped as unknown as Branded<typeof _m>

/**
 * Runtime key resolver for computed keys — `mKey(`landing.cards.${k}.title`)` or
 * `mKey(MAP[k])`. Flattens the dotted key to its snake_case token and calls the
 * message. Returns the raw key (and warns) on a miss, mirroring i18next's
 * graceful degradation. Prefer static `m.token(...)` wherever the key is known.
 */
export const mKey = (key: string, args?: Record<string, unknown>): I18nString => {
  const fn = _raw[identOf(key)]
  if (!fn) {
    if (typeof console !== 'undefined') console.warn(`[i18n] missing message for key "${key}"`)
    return maskI18n(key) as unknown as I18nString
  }
  return maskI18n(fn(args)) as unknown as I18nString
}

/**
 * Resolves an i18next `returnObjects` array (stored as indexed keys `prefix.0`,
 * `prefix.1`, …) back into a list. Returns messages until the first gap.
 */
export const mList = (keyPrefix: string, args?: Record<string, unknown>): I18nString[] => {
  const out: I18nString[] = []
  for (let i = 0; ; i++) {
    const fn = _raw[identOf(`${keyPrefix}.${i}`)]
    if (!fn) break
    out.push(maskI18n(fn(args)) as unknown as I18nString)
  }
  return out
}
