import { Component, type ReactNode, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { parseHostParams, reportReady } from '@/lib/host'
import { m, useHostLocale } from '@/lib/i18n'
import { DesignShell } from '@/shell/DesignShell'

const queryClient = new QueryClient()
const initial = parseHostParams()

// If the user's workspace deps aren't installed yet (fresh sandbox, mid-provision)
// the @project/* imports throw at render. Show a calm "not ready"
// state instead of a white screen; the console can retry once install finishes.
class DepsBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6 text-center font-sans text-[13px] text-[var(--app-text-faint)]">
          <div>
            <div className="mb-1.5 font-semibold">{m.app_not_ready_title()}</div>
            <div>{m.app_not_ready_body()}</div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function App() {
  // The whole shell lives in this iframe; the console is just a host and owns the
  // light/dark switch, handing us its resolved scheme in the URL.
  const colorScheme = initial.colorScheme
  // …and the locale, on the same terms. `dir` follows it: the design surface
  // renders the user's own app, which mirrors wholesale under Arabic.
  const { dir } = useHostLocale()

  // Tell the console we're mounted so it can broadcast the saved-theme list.
  useEffect(() => {
    reportReady()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorScheme === 'dark')
  }, [colorScheme])

  return (
    <DepsBoundary>
      <div dir={dir} style={{ display: 'contents' }}>
        <QueryClientProvider client={queryClient}>
          <DesignShell
            colorScheme={colorScheme}
            initialLens={initial.view}
            initialSection={initial.section}
            showChrome={initial.chrome}
          />
        </QueryClientProvider>
      </div>
    </DepsBoundary>
  )
}
