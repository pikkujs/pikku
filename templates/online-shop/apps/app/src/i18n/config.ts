// i18n configuration — Paraglide JS (inlang). Messages live in `messages/*.json`
// and are compiled to `src/paraglide/` by the Vite plugin (gitignored). This
// module is the locale-plumbing entry point; `@/i18n/messages` exposes the typed
// message functions (`m`).
//
// Add a language: drop `messages/<lang>.json` next to `en.json`, add the code to
// `project.inlang/settings.json` `locales`, and recompile — or just run
// `fabric i18n --add-locale <lang>`, which does both. Content is reachable via
// the `/<lang>` URL prefix (e.g. `/de`); the base locale (`en`) needs none.
import { useSyncExternalStore } from 'react'
import { locales, baseLocale, overwriteGetLocale } from '../paraglide/runtime.js'
import active from './active.json'

export const supportedLocales = locales
export type Locale = (typeof locales)[number]

/**
 * The locale a first-time visitor opens the app in — the language the app speaks
 * to its own users, picked when the project was created and written into
 * `active.json` by `fabric i18n --default-locale <code>`.
 *
 * Deliberately not Paraglide's `baseLocale`: that one names the message SOURCE
 * (`messages/en.json`), the catalog every other locale is cloned from and
 * translated against, so it has to stay `en` for `--add-locale` to work. Seeding
 * the whole app from it is what made an Arabic app open in English LTR until the
 * user found the switcher. Falls back to the base locale when the pick was never
 * compiled (locale dropped from `settings.json` after it was chosen).
 */
export const defaultLocale: Locale = (locales as readonly string[]).includes(active.defaultLocale)
  ? (active.defaultLocale as Locale)
  : baseLocale

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur'])
// Direction for a locale — RTL for Arabic/Hebrew/Farsi/Urdu, else LTR. Set this
// on <html dir> at the root so the browser (and Mantine) mirror the layout.
export function localeDir(locale: string = defaultLocale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale.split('-')[0]) ? 'rtl' : 'ltr'
}

export function detectLocale(pathname: string): Locale {
  const segment = pathname.split('/')[1]
  if (supportedLocales.includes(segment as Locale)) return segment as Locale
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language?.split('-')[0]
    if (supportedLocales.includes(browserLang as Locale)) return browserLang as Locale
  }
  return defaultLocale
}

// ── reactive locale store ────────────────────────────────────────────────────
// Paraglide's `getLocale()` is a module-global, decoupled from React. We bridge
// it to a tiny external store: `getLocale` reads `activeLocale`; components
// subscribe via `useLocale()` (useSyncExternalStore) so `m.*()` re-renders on
// switch — no page reload, no Paraglide `setLocale`, no app-specific context.
// The app's own setLocale (persist + <html dir>) calls `setActiveLocale`.
let activeLocale: Locale = defaultLocale
const listeners = new Set<() => void>()
overwriteGetLocale(() => activeLocale)

export function setActiveLocale(next: Locale): void {
  if (next === activeLocale) return
  activeLocale = next
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Subscribe a component to locale changes so `m.*()` re-renders on switch. The
// codemod injects a bare `useLocale()` wherever `const { t } = useTranslation()`
// used to live; it also returns the active locale + direction for components
// that need them (e.g. the language switcher).
export function useLocale(): {
  locale: Locale
  dir: 'ltr' | 'rtl'
  setLocale: (l: Locale) => void
} {
  const locale = useSyncExternalStore<Locale>(
    subscribe,
    () => activeLocale,
    () => activeLocale,
  )
  return { locale, dir: localeDir(locale), setLocale: setActiveLocale }
}

// ── i18n-debug masking ───────────────────────────────────────────────────────
// When enabled, every *translated* string is masked to block glyphs (█) so any
// readable text left on screen is text that never went through a message (a
// hardcoded/inlined string) — missing i18n at a glance. Toggle with `?i18n-debug`
// in the URL or `localStorage['i18n-debug'] = '1'` (`I18N_DEBUG=1` for SSR).
export function isI18nDebug(): boolean {
  if (typeof process !== 'undefined' && process.env?.I18N_DEBUG === '1') return true
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.has('i18n-debug')) return params.get('i18n-debug') !== '0'
  return window.localStorage?.getItem('i18n-debug') === '1'
}

/** Mask a rendered string when debug mode is on; otherwise pass it through. */
export function maskI18n(s: string): string {
  return isI18nDebug() ? s.replace(/\S/g, '█') : s
}
