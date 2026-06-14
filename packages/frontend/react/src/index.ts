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

// i18n brand types — pure, no react-i18next dependency. The `useI18n` hook and
// provider live on the `@pikku/react/i18n` subpath so consumers that only use
// the brand (e.g. `@pikku/mantine`) never pull in react-i18next.
export type { I18nString, I18nNode } from './i18n-types.js'
export { asI18n } from './i18n-types.js'
