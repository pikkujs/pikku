import { createLocaleStore } from '@pikku/react'
import { locales, baseLocale, overwriteGetLocale } from '../paraglide/runtime.js'
import type { Locale } from '../paraglide/runtime.js'

// @snippet start create-locale-store
export const { useLocale, getLocale, setActiveLocale, setRouteLocale, localeDir, toLocale } =
  createLocaleStore({
    locales,
    defaultLocale: baseLocale,
    storageKey: 'shop-locale',
    // Every compiled message calls Paraglide's own getLocale(); this is the
    // bridge that makes m.foo() follow this store instead.
    overwriteGetLocale: (getLocale) => overwriteGetLocale(getLocale as () => Locale),
    debugLocale: 'xx',
  })
// @snippet end create-locale-store
