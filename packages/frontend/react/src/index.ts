export {
  PikkuProvider,
  usePikkuFetch,
  usePikkuAgent,
  usePikkuRPC,
  usePikkuRealtime,
  usePikkuWorkflow,
} from './pikku-provider.js'
export type { PikkuInstance } from './pikku-provider.js'
export { createPikku } from './create-pikku.js'
export type { CreatePikkuOptions } from './create-pikku.js'

// i18n brand types — pure, framework-agnostic. `I18nString` is structurally
// Paraglide JS's `LocalizedString`, so a Paraglide `m()` message satisfies the
// `@pikku/mantine` gate natively. Apps own their reactive locale store (the
// `@/i18n` Paraglide scaffold); `@pikku/react` only owns the brand.
export type { I18nString, I18nNode } from './i18n-types.js'
export { asI18n } from './i18n-types.js'
