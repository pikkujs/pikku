import { useEffect, useState, type ReactNode } from 'react'
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import {
  ColorSchemeScript,
  DirectionProvider,
  MantineProvider,
  localStorageColorSchemeManager,
  mantineHtmlProps,
  useDirection,
  type MantineThemeOverride,
} from '@pikku/mantine/core'
import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'
import '@mantine/dates/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PikkuProvider, createPikku } from '@pikku/react'
import { PikkuFetch } from '@project/functions-sdk/pikku/pikku-fetch.gen'
import { PikkuRPC } from '@project/functions-sdk/pikku/pikku-rpc.gen'
import {
  activeColorScheme,
  activeId,
  activeTheme,
  buildMantineTheme,
  cssVariablesResolver,
  googleFontsHref,
  themeColorSchemes,
  themes,
  type ColorScheme,
  type Theme,
} from '@project/mantine-themes'
import { defaultLocale, localeDir, supportedLocales, setActiveLocale } from '@/i18n/config'
import { apiUrl } from '@/lib/env'
import { registerAnalyticsClickListener } from '@/lib/analytics-click'
import { recordEvent } from '@/lib/analytics'
import { PreferencesContext } from '@/contexts/preferences'
import { DefaultErrorPage } from '@/components/DefaultErrorPage'
import { DefaultNotFoundPage } from '@/components/DefaultNotFoundPage'

const LOCALE_KEY = 'app-locale'
const THEME_KEY = 'app-theme'
const COLOR_SCHEME_KEY = 'app-color-scheme'
// The active theme id THEME_KEY was saved against — a preference only holds
// while that theme is still the workspace's active one, so a builder-side
// switch (which changes active.json) always wins over a stale local pick.
const THEME_SAVED_ACTIVE_KEY = 'app-theme-saved-active'

const fontsHref = googleFontsHref()

const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_KEY })

// Root route owns the full HTML document for SSR (<html lang dir> so the tree
// mirrors for RTL locales) and wraps the app in the Mantine + react-query +
// Pikku providers. Mantine v8 SSR needs ColorSchemeScript in <head> and
// mantineHtmlProps on <html>; @mantine/core/styles.css ships the static CSS.
function DirectionSync({ locale }: { locale: string }) {
  const { setDirection } = useDirection()
  useEffect(() => {
    setDirection(localeDir(locale))
  }, [locale, setDirection])
  return null
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Northwind Supply' },
    ],
  }),
  notFoundComponent: DefaultNotFoundPage,
  // Wrapped in the document, unlike notFoundComponent. A not-found renders
  // through this route's Outlet so it already has <html> and the providers
  // around it; an error *replaces* the root component, so without this wrapper
  // the error page would be returned as a bare fragment — no document, no
  // MantineProvider, no stylesheet — exactly when the user is already having a
  // bad time.
  errorComponent: (props: ErrorComponentProps) => (
    <RootDocument>
      <DefaultErrorPage {...props} />
    </RootDocument>
  ),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

// The HTML document and providers. Takes children rather than rendering <Outlet />
// itself so the error path above can reuse it: only the children differ.
function RootDocument({ children }: { children: ReactNode }) {
  // Seed from the build-time active theme (active.json) so the applied theme
  // drives the initial + SSR render; useEffect syncs from localStorage after
  // hydration. Seeding 'default' here was the "applied theme never shows" bug.
  const [themeId, setThemeIdRaw] = useState(activeId)
  // Same idea for the locale: seed from the build-time default (i18n/active.json,
  // the language this app's own users speak) so the FIRST paint — server-rendered
  // <html lang dir> included — is already in it, then let a saved preference win
  // after hydration. Widened to string because every consumer here takes one
  // (setLocale, localeDir); `defaultLocale` is a literal union.
  const [locale, setLocaleRaw] = useState<string>(defaultLocale)
  // Transient override from the fabric console live-preview (not persisted) —
  // the console injects a full theme spec into the iframe so the builder sees
  // the look instantly. Takes precedence over the persisted theme.
  const [previewTheme, setPreviewTheme] = useState<MantineThemeOverride | null>(null)
  // The scheme that goes with the live-preview spec (a light style must render
  // light), tracked alongside previewTheme so a preview flips the scheme too.
  const [previewScheme, setPreviewScheme] = useState<ColorScheme | null>(null)

  const effectiveTheme = previewTheme ?? themes[themeId] ?? activeTheme
  const defaultScheme: ColorScheme = themeColorSchemes[themeId] ?? activeColorScheme

  // Sync preferences from localStorage after hydration.
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY)
    const savedAgainst = localStorage.getItem(THEME_SAVED_ACTIVE_KEY)
    if (savedTheme && themes[savedTheme] && savedAgainst === activeId) {
      setThemeIdRaw(savedTheme)
    } else if (savedTheme) {
      localStorage.removeItem(THEME_KEY)
      localStorage.removeItem(THEME_SAVED_ACTIVE_KEY)
    }

    const savedLocale = localStorage.getItem(LOCALE_KEY)
    if (
      savedLocale &&
      supportedLocales.includes(savedLocale as (typeof supportedLocales)[number])
    ) {
      setLocaleRaw(savedLocale)
      setActiveLocale(savedLocale as (typeof supportedLocales)[number])
    }
  }, [])

  // Keep <html lang dir> in sync with locale changes after hydration.
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = localeDir(locale)
  }, [locale])

  // One delegated listener for every `data-analytics-click` in the app,
  // including portalled content (modals, menus, dropdowns) — see
  // lib/analytics-click.ts for why it must be capture-phase.
  useEffect(() => registerAnalyticsClickListener(), [])

  // The matched route id (`/app/account`), not `location.pathname`. A pathname
  // carries every id and slug the app has, and `path` is a queryable column on
  // the raw stream — so the pathname version turns one series into thousands
  // and puts identifiers into the analytics store. The route id is the same
  // information at the cardinality of the route table.
  const routeId = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? state.location.pathname,
  })
  useEffect(() => {
    recordEvent('page_viewed', { path: routeId })
  }, [routeId])

  // Fabric console live-preview: postMessage injects a theme spec to override
  // the active theme without persisting. Accepts `theme` (a full spec) or the
  // legacy `palette`; null resets to the persisted theme.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (data?.source !== 'fabric-console' || data.type !== 'set-theme') return
      try {
        const spec = (data.theme ?? data.palette) as Theme | null
        setPreviewTheme(spec ? buildMantineTheme(spec) : null)
        setPreviewScheme(spec?.structure?.defaultColorScheme ?? null)
      } catch (err) {
        console.warn('[mantine-themes] ignoring bad theme payload', err)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const setLocale = (next: string) => {
    localStorage.setItem(LOCALE_KEY, next)
    setLocaleRaw(next)
    setActiveLocale(next as (typeof supportedLocales)[number])
  }

  const setThemeId = (next: string) => {
    localStorage.setItem(THEME_KEY, next)
    localStorage.setItem(THEME_SAVED_ACTIVE_KEY, activeId)
    setThemeIdRaw(next)
    setPreviewTheme(null)
    setPreviewScheme(null)
  }

  // Per-render instances keep server requests from sharing client/cache state.
  const [queryClient] = useState(() => new QueryClient())
  const [pikku] = useState(() =>
    createPikku(PikkuFetch, PikkuRPC, {
      serverUrl: apiUrl(),
      credentials: 'include',
    }),
  )

  return (
    <html lang={locale} dir={localeDir(locale)} {...mantineHtmlProps}>
      <head>
        <HeadContent />
        <ColorSchemeScript
          defaultColorScheme={activeColorScheme}
          localStorageKey={COLOR_SCHEME_KEY}
        />
        {/* Fabric's own tab mark (not app-specific — the app's identity is the
            wordmark text, see Wordmark.tsx). Two variants so the tab icon reads
            on both a light and a dark OS/browser chrome, picked natively via
            prefers-color-scheme (no JS); each is a touch smaller/lighter than
            the old single hardcoded-dark version. */}
        <link
          rel="icon"
          media="(prefers-color-scheme: light)"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='10' fill='%2318181b'/%3E%3Cpath d='M10 12h12M10 16h12M10 20h7' stroke='white' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E"
        />
        <link
          rel="icon"
          media="(prefers-color-scheme: dark)"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='10' fill='%23fafafa'/%3E%3Cpath d='M10 12h12M10 16h12M10 20h7' stroke='%2318181b' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E"
        />
        {fontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={fontsHref} />
          </>
        )}
      </head>
      <body>
        <DirectionProvider initialDirection={localeDir(locale)}>
          <MantineProvider
            theme={effectiveTheme}
            cssVariablesResolver={cssVariablesResolver}
            colorSchemeManager={colorSchemeManager}
            defaultColorScheme={defaultScheme}
            forceColorScheme={previewScheme && previewScheme !== 'auto' ? previewScheme : undefined}
          >
            <DirectionSync locale={locale} />
            <PreferencesContext.Provider value={{ locale, themeId, setLocale, setThemeId }}>
              <QueryClientProvider client={queryClient}>
                <PikkuProvider pikku={pikku}>{children}</PikkuProvider>
              </QueryClientProvider>
            </PreferencesContext.Provider>
          </MantineProvider>
        </DirectionProvider>
        <Scripts />
      </body>
    </html>
  )
}
