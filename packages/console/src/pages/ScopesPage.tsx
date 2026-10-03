import { useState } from 'react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { ScopesOverview } from '../components/scopes/ScopesOverview'
import { useScopeFilters } from '../components/scopes/useScopeFilters'
import { CardsPage } from '../components/ui/CardsPage'
import { useSearchParams } from '../router'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'

export const ScopesPage: React.FC = () => {
  useLocale()
  // Seeded from `?search=` so one scope is linkable from elsewhere — a knowledge
  // note naming `scope:entry:write` opens this list on it. Initial value only;
  // from then on the box belongs to the reader.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const { headerFilters, role, source } = useScopeFilters()

  return (
    <PageContainer
      data-testid="scopes-page"
      surface="cards"
      header={
        <ListPageHeader
          title={m.scopes_page_title()}
          description={m.scopes_page_desc_plain()}
          docsHref="https://pikku.dev/docs/core-features/permission-guards"
          search={{
            placeholder: m.scopes_search_scopes(),
            value: search,
            onChange: setSearch,
            width: 240,
          }}
          headerFilters={headerFilters}
        />
      }
    >
      <CardsPage>
        <ScopesOverview search={search} role={role} source={source} />
      </CardsPage>
    </PageContainer>
  )
}
