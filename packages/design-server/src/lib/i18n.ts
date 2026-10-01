import { useEffect, useState } from 'react'
import { getLocale, getTextDirection, isLocale, setLocale } from '@/paraglide/runtime.js'
import type { Locale } from '@/paraglide/runtime.js'

// ─────────────────────────────────────────────────────────────────────────────
// This app's own messages, in a SEPARATE inlang project from the console's: nothing
// outside this server uses these strings. The server ships as SOURCE and runs `vite`
// (dev) rather than a build, so messages are compiled at publish time into
// src/paraglide and the runtime needs no extra dependency.
//
// The console owns the locale, exactly as it owns the colour scheme: it arrives
// as `?locale=` and can change while we are mounted (`set-locale`). Paraglide is
// compiled with the `globalVariable` strategy so applying one is a plain call —
// no cookie, which would not reach us reliably inside a cross-host iframe.
// ─────────────────────────────────────────────────────────────────────────────

export { m } from '@/paraglide/messages.js'
export type { Locale }

/** The locale in the URL, if the console put a usable one there. */
export function initialLocale(): Locale | null {
  const raw = new URLSearchParams(window.location.search).get('locale')
  return raw && isLocale(raw) ? raw : null
}

/**
 * Apply the console's locale and re-render when it changes. Returns the active
 * locale so the shell can set `dir` — Arabic is RTL, and a design surface that
 * renders the user's own app has to mirror with it.
 */
export function useHostLocale(): { locale: Locale; dir: 'ltr' | 'rtl' } {
  const [locale, setActive] = useState<Locale>(() => {
    const fromUrl = initialLocale()
    if (fromUrl) setLocale(fromUrl, { reload: false })
    return getLocale()
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== 'pikku-console' || data.type !== 'set-locale') return
      if (!isLocale(data.locale) || data.locale === locale) return
      setLocale(data.locale, { reload: false })
      setActive(data.locale)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [locale])

  return { locale, dir: getTextDirection(locale) }
}
