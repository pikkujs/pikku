import type { ReactElement, ReactPortal } from 'react'

declare const _i18nBrand: unique symbol

/**
 * A plain string that has been explicitly passed through `t()` or `asI18n()`.
 * Compile-time brand only — at runtime this is just a string.
 */
export type I18nString = string & { readonly [_i18nBrand]: true }

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
