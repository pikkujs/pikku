import type { ReactElement, ReactPortal } from 'react'

/**
 * A string that has been through i18n. Structurally identical to Paraglide JS's
 * `LocalizedString` (`string & { readonly __brand: 'LocalizedString' }`), so a
 * Paraglide `m()` message satisfies this brand — and the `@pikku/mantine` gate —
 * natively, with no wrapper. Also produced by `t()` / `asI18n()`. Compile-time
 * brand only: at runtime this is just a string.
 *
 * The brand is the string literal `'LocalizedString'`, not a `unique symbol`, on
 * purpose: matching Paraglide's public brand is what lets `m()` flow into gated
 * props directly. It still blocks bare `string` (which has no `__brand`), so the
 * gate is unchanged; only deliberately-cast values (`asI18n`) get through.
 */
export type I18nString = string & { readonly __brand: 'LocalizedString' }

/**
 * Drop-in for `ReactNode` in props that should carry translated text: anything
 * `ReactNode` allows, EXCEPT a bare, unbranded `string`.
 *
 * We use `ReadonlyArray` (not `Iterable`) for the multiple-children case on
 * purpose. A `string` IS structurally an `Iterable<…>` — TypeScript resolves the
 * recursion co-inductively and would let plain strings back in through that
 * backdoor — but a `string` is NOT assignable to a readonly array. So arrays /
 * multiple children pass while bare strings stay blocked.
 */
export type I18nNode =
  | I18nString
  | ReactElement
  | ReactPortal
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<I18nNode>

/**
 * Escape hatch for dynamic strings that legitimately come from outside i18n
 * (server errors, user-supplied content, etc.). Use deliberately.
 */
export const asI18n = (s: string): I18nString => s as I18nString
