import { useSyncExternalStore } from 'react'
import type { I18nString } from './i18n-types.js'

/**
 * Locales whose scripts run right-to-left. The whole layout mirrors off the
 * `dir` attribute, so this has to be right before anything renders.
 */
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur']

/**
 * `process.env` where there is one — under SSR — read through `globalThis`, so
 * this browser module needs no Node types to compile.
 */
const serverEnv = (): Record<string, string | undefined> | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env

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
      if (serverEnv()?.I18N_DEBUG === '1') {
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

/** A Paraglide message namespace with every message function returning `I18nString`. */
export type BrandedMessages<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => unknown
    ? (...args: A) => I18nString
    : T[K]
}

/**
 * Wrap a compiled Paraglide namespace (`import { m } from '../paraglide/messages.js'`)
 * so every message returns the branded `I18nString` the `@pikku/react` gate
 * accepts, passing each rendered string through `mask`. `mask` is how i18n-debug
 * mode blocks out translated text.
 *
 * The whole namespace is wrapped, which forgoes Paraglide's per-message
 * tree-shaking: locale files are kilobytes and the catalogue of a typical app is
 * small enough to ship.
 */
export const brandMessages = <T extends object>(
  paraglideMessages: T,
  mask: (rendered: string) => string = (rendered) => rendered
): BrandedMessages<T> => {
  const raw = paraglideMessages as unknown as Record<string, unknown>
  const wrapped: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    const message = raw[key]
    wrapped[key] =
      typeof message === 'function'
        ? (...args: unknown[]) =>
            mask((message as (...a: unknown[]) => string)(...args))
        : message
  }
  return wrapped as unknown as BrandedMessages<T>
}

/** The slice of Paraglide's compiled `runtime.js` the app i18n reads. */
export interface ParaglideRuntime<L extends string> {
  locales: readonly L[]
  baseLocale: L
  overwriteGetLocale: (getLocale: () => L) => void
}

export interface CreateAppI18nOptions<M extends object, L extends string> {
  /** Paraglide's compiled message namespace: `import { m } from '../paraglide/messages.js'`. */
  messages: M
  /** Paraglide's compiled runtime: `import * as runtime from '../paraglide/runtime.js'`. */
  runtime: ParaglideRuntime<L>
  /** The app's `active.json`: the locale a first-time visitor opens in. */
  active: { defaultLocale: string }
  /** The i18n-debug pseudo-locale, as in {@link CreateLocaleStoreOptions.debugLocale}. */
  debugLocale?: string
}

export interface AppI18n<M extends object, L extends string> extends Omit<
  LocaleStore<L>,
  'subscribe'
> {
  /** The branded, debug-maskable message namespace — the only way to reach a message. */
  m: BrandedMessages<M>
  supportedLocales: readonly L[]
  /** The locale a first-time visitor opens the app in. */
  defaultLocale: L
  /** The locale for a URL path (`/de/...`), else the browser language, else {@link AppI18n.defaultLocale}. */
  detectLocale: (pathname: string) => L
  /** Mask a rendered string when debug mode is on; otherwise pass it through. */
  maskI18n: (rendered: string) => string
}

/**
 * Everything an app's `i18n/` folder used to hold, from the three things only
 * the app has: its compiled Paraglide output and its `active.json`.
 *
 * `defaultLocale` is the language the app speaks to its own users, picked when
 * the project was created and written into `active.json` by `pikku i18n`. It is
 * deliberately not Paraglide's `baseLocale`: that names the message SOURCE
 * (`messages/en.json`), the catalogue every other locale is cloned from and
 * translated against, so it has to stay `en` for `pikku i18n --add-locale` to
 * work. Seeding the whole app from it is what made an Arabic app open in English
 * LTR until the user found the switcher. It falls back to the base locale when
 * the pick was never compiled (a locale dropped from `settings.json` after it
 * was chosen).
 *
 * Add a language: drop `messages/<lang>.json` next to `en.json`, add the code to
 * `project.inlang/settings.json` `locales`, and recompile — or run
 * `pikku i18n --add-locale <lang>`, which does both. Content is reachable via the
 * `/<lang>` URL prefix (e.g. `/de`); the base locale needs none.
 *
 * Every translated string is masked to block glyphs (█) in i18n-debug mode, so
 * any readable text left on screen never went through a message. Toggle it with
 * `?i18n-debug` in the URL or `localStorage['i18n-debug'] = '1'` (`I18N_DEBUG=1`
 * for SSR).
 */
export const createAppI18n = <M extends object, L extends string>(
  options: CreateAppI18nOptions<M, L>
): AppI18n<M, L> => {
  const { messages, runtime, active, debugLocale } = options
  const supportedLocales = runtime.locales
  const defaultLocale: L = supportedLocales.includes(active.defaultLocale as L)
    ? (active.defaultLocale as L)
    : runtime.baseLocale

  // A visitor starts in the app's default locale; the app's own switcher
  // (persist + <html dir>) calls `setActiveLocale`.
  const { subscribe: _subscribe, ...store } = createLocaleStore<L>({
    locales: supportedLocales,
    defaultLocale,
    overwriteGetLocale: runtime.overwriteGetLocale as (
      getLocale: () => string
    ) => void,
    debugLocale,
    detectInitialLocale: ({ defaultLocale: initial }) => initial,
  })

  const maskI18n = (rendered: string): string =>
    store.isI18nDebug() ? rendered.replace(/\S/g, '█') : rendered

  const detectLocale = (pathname: string): L => {
    const segment = pathname.split('/')[1] as L
    if (supportedLocales.includes(segment)) return segment
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language?.split('-')[0] as L
      if (supportedLocales.includes(browserLang)) return browserLang
    }
    return defaultLocale
  }

  return {
    ...store,
    m: brandMessages(messages, maskI18n),
    supportedLocales,
    defaultLocale,
    detectLocale,
    maskI18n,
  }
}
