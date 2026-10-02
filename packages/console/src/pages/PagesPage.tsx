import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Button } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Monitor, RotateCw } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { useSearchParams } from '../router'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { SectionCard } from '../components/ui/SectionCard'
import { ForDevelopers } from '../components/ui/ForDevelopers'
import { DevNote } from '../components/ui/DevDetail'
import type { TakePictures } from '../components/pages/PagesCards'
import {
  useAppAddress,
  usePages,
  usePageShots,
  useTakePictures,
} from '../hooks/usePages'
import { PagesOverview } from './PagesOverview'

const PAGES_DOCS_HREF = 'https://pikku.dev/docs'

export const PagesPage: React.FC = () => {
  useLocale()
  const pages = usePages()
  const shots = usePageShots()
  const [address, setAddress] = useAppAddress()
  const [searchParams, setSearchParams] = useSearchParams()
  const takePictures = useTakePictures()
  const [pending, setPending] = useState<TakePictures['pending']>(null)

  const take: TakePictures = {
    pending: takePictures.isPending ? pending : null,
    error: takePictures.error,
    run: ({ app, pages: targets, params, only }) => {
      setPending({ app, only: only ? `${app}:${targets[0]!.path}` : undefined })
      takePictures.mutate({
        baseUrl: address.trim(),
        app,
        pages: targets,
        params,
        only,
      })
    },
  }

  const shell = (children: React.ReactNode) => (
    <ConsoleSurface>
      <ResizablePanelLayout
        hidePanel
        surface="cards"
        header={<ListPageHeader title={m.pages_page_title()} />}
      >
        {children}
      </ResizablePanelLayout>
    </ConsoleSurface>
  )

  if (pages.isLoading) return shell(<ConsoleLoading />)

  if (pages.error) {
    return shell(
      <CardsPage>
        <SectionCard
          hero
          testId="pages-failed"
          title={m.pages_failed_title()}
          blurb={m.pages_failed_blurb()}
          right={
            <Button
              variant="light"
              leftSection={<RotateCw size={16} />}
              loading={pages.isFetching}
              onClick={() => pages.refetch()}
            >
              {m.pages_try_again()}
            </Button>
          }
        >
          <ForDevelopers attached testId="pages-failed-developers">
            <DevNote>
              {asI18n(
                pages.error instanceof Error
                  ? pages.error.message
                  : String(pages.error)
              )}
            </DevNote>
          </ForDevelopers>
        </SectionCard>
      </CardsPage>
    )
  }

  if (!pages.data?.length) {
    return shell(
      <EmptyStatePlaceholder
        icon={Monitor}
        title={m.pages_empty_title()}
        description={m.pages_empty_description()}
        code="pikku pages list"
        docsHref={PAGES_DOCS_HREF}
      />
    )
  }

  return (
    <ConsoleSurface>
      <PagesOverview
        pages={pages.data}
        shots={shots}
        address={address}
        onAddress={setAddress}
        take={take}
        selectedKey={searchParams.get('screen')}
        onSelect={(key) => setSearchParams(key ? { screen: key } : {})}
      />
    </ConsoleSurface>
  )
}
