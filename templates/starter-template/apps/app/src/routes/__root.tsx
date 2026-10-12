import { useEffect, useState, type ReactNode } from 'react'
import { createRootRoute, HeadContent, Outlet, Scripts, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PikkuProvider, createPikku } from '@pikku/react'
import { PikkuFetch } from '@project/functions-sdk/pikku/pikku-fetch.gen'
import { PikkuRPC } from '@project/functions-sdk/pikku/pikku-rpc.gen'
import { defaultLocale, localeDir, supportedLocales, setActiveLocale } from '@/i18n/config'
import { appMeta } from '@/app-meta'
import { apiUrl } from '@/lib/env'
import { PreferencesContext } from '@/contexts/preferences'
import { DefaultErrorPage } from '@/components/DefaultErrorPage'
import { DefaultNotFoundPage } from '@/components/DefaultNotFoundPage'
import globals from '@/styles/globals.css?url'

const LOCALE_KEY = 'app-locale'
const COLOR_SCHEME_KEY = 'app-color-scheme'

export const Route = createRootRoute({
  head: () => ({ meta: appMeta, links: [{ rel: 'stylesheet', href: globals }] }),
  notFoundComponent: DefaultNotFoundPage,
  errorComponent: (props: ErrorComponentProps) => (
    <RootDocument>
      <DefaultErrorPage {...props} />
    </RootDocument>
  ),
  component: () => (
    <RootDocument>
      <Outlet />
    </RootDocument>
  ),
})

// Applies the saved colour scheme before first paint so a dark user never flashes light.
const schemeScript = `try{var s=localStorage.getItem('${COLOR_SCHEME_KEY}');if(s==='dark')document.documentElement.classList.add('dark')}catch(e){}`

function RootDocument({ children }: { children: ReactNode }) {
  const [locale, setLocaleRaw] = useState<string>(defaultLocale)
  const [queryClient] = useState(() => new QueryClient())
  const [pikku] = useState(() => createPikku(PikkuFetch, PikkuRPC, { serverUrl: apiUrl(), credentials: 'include' }))
  const router = useRouter()

  useEffect(() => {
    const root = document.documentElement
    const publish = () => {
      if (!router.state.isLoading) root.setAttribute('data-app-hydrated', 'true')
    }
    const clear = () => root.removeAttribute('data-app-hydrated')
    publish()
    const offStart = router.subscribe('onBeforeNavigate', clear)
    const offResolved = router.subscribe('onResolved', publish)
    return () => {
      offStart()
      offResolved()
    }
  }, [router])

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved && supportedLocales.includes(saved as (typeof supportedLocales)[number])) {
      setLocaleRaw(saved)
      setActiveLocale(saved as (typeof supportedLocales)[number])
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = localeDir(locale)
  }, [locale])

  // Studio and console live preview: they post the generated theme.css and we swap it in without persisting.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (event.source !== window.parent) return
      if (data?.source !== 'fabric-console' || data.type !== 'set-theme-css') return
      let style = document.getElementById('theme-preview')
      if (!style) {
        style = document.createElement('style')
        style.id = 'theme-preview'
        document.head.appendChild(style)
      }
      style.textContent = typeof data.css === 'string' ? data.css : ''
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const setLocale = (next: string) => {
    localStorage.setItem(LOCALE_KEY, next)
    setLocaleRaw(next)
    setActiveLocale(next as (typeof supportedLocales)[number])
  }

  return (
    <html lang={locale} dir={localeDir(locale)}>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: schemeScript }} />
      </head>
      <body>
        <PreferencesContext.Provider value={{ locale, themeId: 'default', setLocale, setThemeId: () => {} }}>
          <QueryClientProvider client={queryClient}>
            <PikkuProvider pikku={pikku}>{children}</PikkuProvider>
          </QueryClientProvider>
        </PreferencesContext.Provider>
        <Scripts />
      </body>
    </html>
  )
}
