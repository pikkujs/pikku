import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  PikkuProvider,
  createPikku,
  createAnalytics,
  createFeatureFlags,
  useFeatureFlag,
  usePikkuAnalytics,
} from '@pikku/react'
import { PikkuFetch } from '#pikku/pikku-fetch.gen.js'
import { PikkuRPC } from '#pikku/pikku-rpc.gen.js'
import type { FeatureFlagName } from '#pikku/scopes/pikku-flags.gen.js'

/**
 * The smallest app that uses every browser-side primitive the way a real one
 * does, so the scenarios drive the shipped clients rather than a copy of them.
 *
 * It is deliberately not a fixture with test hooks: the consent banner writes
 * the same cookie the server's identity resolver reads, the panel is gated on
 * the same flag the function is gated on, and the events are flushed by the
 * client's own timer and `pagehide` handler. What a scenario asserts is what a
 * user would have caused.
 */
type AppEvent = { name: 'page_viewed'; path: string }

const CONSENT_COOKIE = 'e2e_consent'

const readConsent = (): boolean =>
  document.cookie
    .split(';')
    .some((entry) => entry.trim() === `${CONSENT_COOKIE}=1`)

const pikku = {
  ...createPikku(PikkuFetch, PikkuRPC, { serverUrl: window.location.origin }),
  featureFlags: createFeatureFlags<FeatureFlagName>({
    endpoint: `${window.location.origin}/feature-flags`,
  }),
  analytics: createAnalytics<AppEvent>({
    endpoint: `${window.location.origin}/analytics`,
    // Short enough that a scenario can read the destination back without
    // waiting on the default, long enough to still be a batch.
    flushIntervalMs: 1_000,
    // Read on every flush rather than captured once, so answering the banner
    // takes effect on the events already buffered behind it.
    enabled: readConsent,
  }),
}

/** Gated on the flag, exactly as the function behind it is. */
const QuarterlyPanel: React.FC = () => {
  const show = useFeatureFlag<FeatureFlagName>('quarterlyReports')
  if (!show) return null
  return (
    <section data-testid="quarterly-panel">
      <h2>Quarterly reports</h2>
    </section>
  )
}

const BulkExportPanel: React.FC = () => {
  const show = useFeatureFlag<FeatureFlagName>('bulkExport')
  if (!show) return null
  return (
    <section data-testid="bulk-export-panel">
      <h2>Bulk export</h2>
    </section>
  )
}

const DarkPanel: React.FC = () => {
  const show = useFeatureFlag<FeatureFlagName>('darkLaunch')
  if (!show) return null
  return <section data-testid="dark-launch-panel">Not yet</section>
}

const ConsentBanner: React.FC<{
  consented: boolean
  onAnswer: (granted: boolean) => void
}> = ({ consented, onAnswer }) => (
  <div data-testid="consent-banner" data-consented={String(consented)}>
    <button data-testid="consent-accept" onClick={() => onAnswer(true)}>
      Accept analytics
    </button>
    <button data-testid="consent-refuse" onClick={() => onAnswer(false)}>
      Refuse
    </button>
  </div>
)

const App: React.FC = () => {
  const analytics = usePikkuAnalytics<AppEvent>()
  const [path, setPath] = useState('/')
  const [consented, setConsented] = useState(readConsent)

  // One per view, the way a router would: the client buffers them and decides
  // when they leave.
  useEffect(() => {
    analytics.event('page_viewed', { path })
  }, [analytics, path])

  const answer = (granted: boolean) => {
    document.cookie = `${CONSENT_COOKIE}=${granted ? '1' : 'denied'}; path=/`
    setConsented(granted)
  }

  return (
    <main data-testid="app" data-path={path}>
      <nav>
        <button data-testid="nav-home" onClick={() => setPath('/')}>
          Home
        </button>
        <button data-testid="nav-pricing" onClick={() => setPath('/pricing')}>
          Pricing
        </button>
      </nav>
      <ConsentBanner consented={consented} onAnswer={answer} />
      <QuarterlyPanel />
      <BulkExportPanel />
      <DarkPanel />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PikkuProvider pikku={pikku}>
      <App />
    </PikkuProvider>
  </StrictMode>
)
