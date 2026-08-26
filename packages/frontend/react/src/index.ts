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
// `@pikku/mantine` gate natively.
export type { I18nString, I18nNode } from './i18n-types.js'
export { asI18n } from './i18n-types.js'

// The reactive locale store behind those messages. An app supplies its locale
// list, its storage key and its startup policy, and passes in Paraglide's
// `overwriteGetLocale` from its own compiled runtime — this package never
// imports one app's generated output.
export { createLocaleStore } from './locale-store.js'
export type { CreateLocaleStoreOptions, LocaleStore } from './locale-store.js'

// Dev-only scenario actor sign-in — the logic half of the "Sign in as …"
// switcher. UI-free, so `@pikku/mantine/dev` (which peer-depends on this
// package) can build the rendered control on top of it.
export { parseDevActors, signInAsActor, useDevActors } from './dev-actors.js'
export type {
  DevActor,
  SignInAsActorOptions,
  UseDevActorsOptions,
  UseDevActorsResult,
} from './dev-actors.js'

// Buffered product-analytics client, typed against the app's own event union.
// The app owns the union and the endpoint; this package owns the transport.
export { createAnalytics } from './analytics.js'
export type { AnalyticsClient, CreateAnalyticsOptions } from './analytics.js'
