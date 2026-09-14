import { useState } from 'react'
import type { AnalyticsEventMeta } from '@pikku/core/analytics'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { AnalyticsEventsList } from '../components/analytics/AnalyticsEventsList'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useSearchParams } from '../router'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'

export const AnalyticsPage: React.FC = () => {
  useLocale()
  const [search, setSearch] = useState('')
  // Resolved from meta by NAME rather than held as the row captured at click
  // time, so the panel always describes the event the catalog is showing.
  const [searchParams, setSearchParams] = useSearchParams()
  const { meta } = usePikkuMeta()
  const selectedName = searchParams.get('event')
  const selected = selectedName
    ? (meta.analyticsEvents[selectedName] ?? null)
    : null

  const openEvent = (event: AnalyticsEventMeta) =>
    setSearchParams({ event: event.name })

  return (
    <PageContainer
      noPadding
      header={
        <ListPageHeader
          title={m.analytics_page_title()}
          description={m.analytics_page_desc()}
          docsHref="https://pikku.dev/docs/console/features#analytics-events"
          search={{
            placeholder: m.analytics_search(),
            value: search,
            onChange: setSearch,
            width: 240,
            helpAnchor: 'search',
          }}
        />
      }
    >
      <AnalyticsEventsList
        search={search}
        selected={selected}
        panelOpen={selected !== null}
        onOpenEvent={openEvent}
        onClosePanel={() => setSearchParams({})}
      />
    </PageContainer>
  )
}
