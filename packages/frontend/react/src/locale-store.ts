import { useSyncExternalStore } from 'react'

/**
 * Locales whose scripts run right-to-left. The whole layout mirrors off the
 * `dir` attribute, so this has to be right before anything renders.
 */
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur']

export interface CreateLocaleStoreOptions<L extends string> {
  /** Every locale the app serves. Drives URL prefixes, hreflang and narrowing. */
  locales: readonly L[]
  /** The locale used when nothing else resolves. */
  defaultLocale: L
  /**
   * `localStorage` key the chosen locale is persisted under. Omit and the choice
   * lasts for the session — a route locale never persists either way.
   */
  storageKey?: string
  /**
   * Paraglide's `overwriteGetLocale`, imported by the app from its own compiled
   * runtime and passed in — a package that imported it would be taking a
   * dependency on one app's compiled output.
   *
   * Every compiled message calls the runtime's `getLocale()` to pick a variant.
   * Left alone it resolves through Paraglide's own cookie and URL strategies,
   * which know nothing about this store, so `m.foo()` renders a locale the app
   * does not believe is active. Passing it makes this store the single source of
   * truth.
   */
  overwriteGetLocale?: (getLocale: () => string) => void
  /**
   * The i18n-debug pseudo-locale (`paraglideMaskLocale` in `@pikku/paraglide`
   * writes it). When set, debug mode resolves messages through it instead of the
   * active locale. Deliberately not a member of `locales`: that list drives URL
   * prefixes, hreflang and any backend `locale` param, none of which should see
   * it.
   */
  debugLocale?: string
  /** Override the RTL language list. */
  rtlLanguages?: readonly string[]
  /**
   * The app's own startup policy. The default is persisted choice → browser
   * language → `<html lang>` → `defaultLocale`, which is what every app doing
   * this by hand had written; replace it when the app resolves locale from
   * somewhere else, such as its route or the signed-in user.
   */
  detectInitialLocale?: (context: {
    /** Narrows an arbitrary string to a supported locale, or undefined. */
    normalize: (value: string | null | undefined) => L | undefined
    defaultLocale: L
  }) => L
}

export interface LocaleStore<L extends string> {
  /** Subscribes a component to locale changes so messages re-render on switch. */
  useLocale: () => {
    locale: L
    dir: 'ltr' | 'rtl'
    setLocale: (locale: L) => void
  }
  /** The active locale, for code that formats dates and numbers. */
  getLocale: () => L
  /** Switches locale and remembers the choice. */
  setActiveLocale: (next: L) => void
  /** Switches locale without remembering it — the URL already said so. */
  setRouteLocale: (next: L) => void
  /** Writing direction for a locale. */
  localeDir: (locale?: string) => 'ltr' | 'rtl'
  /** Narrows a route param, which is only ever `string`, to a locale. */
  toLocale: (value: string | null | undefined) => L
  /** Raw store subscription, for a non-React consumer. */
  subscribe: (listener: () => void) => () => void
  /** Whether the app is rendering the mask locale. */
  isI18nDebug: () => boolean
}

/**
 * The reactive locale store every Pikku frontend was writing by hand.
 *
 * What each app kept was identical: a module-level active locale, a listener
 * set, a `useSyncExternalStore` hook, an RTL check, a persisting setter and a
 * non-persisting one, and the bridge that points Paraglide's `getLocale()` at
 * all of it. What differed was only the locale list, the storage key and the
 * startup policy — the three things this takes as options.
 *
 * The bridge is why the duplication mattered rather than merely being untidy.
 * It is one line, it is the least obvious line, and an app that copied the store
 * but dropped it renders one locale while believing in another — which is
 * exactly what happened.
 */
export const createLocaleStore = <L extends string>(
  options: CreateLocaleStoreOptions<L>
): LocaleStore<L> => {
  const { locales, defaultLocale, storageKey, debugLocale } = options
  const rtl = options.rtlLanguages ?? RTL_LANGUAGES

  const listeners = new Set<() => void>()
  let activeLocale: L = defaultLocale

  const localeDir = (locale: string = defaultLocale): 'ltr' | 'rtl' =>
    rtl.includes(locale.split('-')[0]!) ? 'rtl' : 'ltr'

  const normalize = (value: string | null | undefined): L | undefined => {
    const short = value?.slice(0, 2).toLowerCase() as L | undefined
    return short && locales.includes(short) ? short : undefined
  }

  const toLocale = (value: string | null | undefined): L =>
    normalize(value) ?? defaultLocale

  const detectInitialLocale =
    options.detectInitialLocale ??
    (() => {
      if (typeof window === 'undefined') return defaultLocale
      return (
        (storageKey
          ? normalize(window.localStorage?.getItem(storageKey))
          : undefined) ??
        normalize(window.navigator?.language) ??
        normalize(window.document?.documentElement?.lang) ??
        defaultLocale
      )
    })

  /**
   * Read once and cached: this is consulted on every message call, and the
   * answer cannot change without a navigation.
   */
  let debugMode: boolean | undefined
  const isI18nDebug = (): boolean => {
    if (debugMode !== undefined) return debugMode
    debugMode = (() => {
      if (typeof process !== 'undefined' && process.env?.I18N_DEBUG === '1') {
        return true
      }
      if (typeof window === 'undefined') return false
      const params = new URLSearchParams(window.location.search)
      if (params.has('i18n-debug')) return params.get('i18n-debug') !== '0'
      return window.localStorage?.getItem('i18n-debug') === '1'
    })()
    return debugMode
  }

  /**
   * `dir` matters as much as `lang`, and both are applied at startup rather than
   * on first change: the server renders the base locale because it cannot see
   * `localStorage`, and React does not patch mismatched attributes during
   * hydration — so a persisted RTL locale would otherwise come back as
   * right-to-left text inside a left-to-right layout after every full load.
   */
  const applyDocumentLocale = (locale: L): void => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale
    document.documentElement.dir = localeDir(locale)
  }

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const setRouteLocale = (next: L): void => {
    if (next === activeLocale) return
    activeLocale = next
    applyDocumentLocale(next)
    notify()
  }

  const setActiveLocale = (next: L): void => {
    if (next === activeLocale) return
    if (storageKey && typeof window !== 'undefined') {
      window.localStorage?.setItem(storageKey, next)
    }
    setRouteLocale(next)
  }

  activeLocale = detectInitialLocale({ normalize, defaultLocale })
  applyDocumentLocale(activeLocale)

  options.overwriteGetLocale?.(() =>
    debugLocale && isI18nDebug() ? debugLocale : activeLocale
  )

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const getLocale = (): L => activeLocale

  return {
    useLocale: () => {
      const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
      return { locale, dir: localeDir(locale), setLocale: setActiveLocale }
    },
    getLocale,
    setActiveLocale,
    setRouteLocale,
    localeDir,
    toLocale,
    subscribe,
    isI18nDebug,
  }
}
