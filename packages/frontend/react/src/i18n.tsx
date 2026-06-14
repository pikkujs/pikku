import { useTranslation } from 'react-i18next'
import type { I18nString } from './i18n-types.js'

export type { I18nString, I18nNode } from './i18n-types.js'
export { asI18n } from './i18n-types.js'

/** The i18n provider. Re-exported so consumers wire i18n from one place. */
export { I18nextProvider as I18nProvider } from 'react-i18next'

/**
 * Drop-in for `useTranslation()` — same API, but `t()` is typed to return
 * {@link I18nString} so the compiler can enforce that every user-visible string
 * went through i18n. Pairs with `@pikku/mantine`, whose components only accept
 * branded text.
 */
export function useI18n() {
  const result = useTranslation()
  return {
    ...result,
    t: result.t as unknown as (
      ...args: Parameters<typeof result.t>
    ) => I18nString,
  }
}
