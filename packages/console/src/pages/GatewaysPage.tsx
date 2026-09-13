import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { GatewaysListPanel } from '../components/gateways/GatewaysListPanel'
import { useGatewayItems } from '../hooks/useGatewayItems'

export type GatewaysPageProps = {
  emptyHero?: React.ReactNode
}

export const GatewaysPage: React.FC<GatewaysPageProps> = ({ emptyHero }) => {
  const { items, loading } = useGatewayItems()
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.gateways_title()}
            description={m.gateways_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.gateways_select_item()}
      >
        <GatewaysListPanel emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
