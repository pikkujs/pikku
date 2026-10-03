import React from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { Ear, MessagesSquare, Network, Webhook } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { useGatewayItems } from '../../hooks/useGatewayItems'
import { toEnglishName } from '../../lib/strings'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard } from '../ui/SummaryCard'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevTable } from '../ui/DevDetail'

const GATEWAYS_DOCS = 'https://pikku.dev/docs/wiring/gateway'

const TYPE_ICON = {
  websocket: MessagesSquare,
  webhook: Webhook,
  listener: Ear,
} as const

const isOpen = (gateway: any) => gateway.auth === false

const describe = (gateway: any) => {
  const route = gateway.route ?? ''
  if (gateway.type === 'websocket') return m.gateway_page_meta_websocket({ route })
  if (gateway.type === 'webhook') {
    return gateway.platform
      ? m.gateway_page_meta_webhook_platform({
          platform: gateway.platform,
          route,
        })
      : m.gateway_page_meta_webhook({ route })
  }
  return m.gateway_page_meta_listener()
}

export const GatewaysWorkspace: React.FC<{
  searchQuery: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery, emptyHero }) => {
  useLocale()
  const { openGateway } = usePanelContext()
  const { items: gateways, loading } = useGatewayItems()
  const query = searchQuery.trim().toLowerCase()

  usePanelUrl({
    type: 'gateway',
    items: gateways,
    getId: (gateway: any) => gateway.name,
    open: openGateway,
  })

  if (!loading && gateways.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Network}
        hero={emptyHero}
        title={m.gateways_title()}
        description={m.gateways_empty_message()}
        docsHref={GATEWAYS_DOCS}
      />
    )
  }

  const total = gateways.length
  const chats = gateways.filter((g) => g.type === 'websocket').length
  const webhooks = gateways.filter((g) => g.type === 'webhook').length
  const signedIn = gateways.filter((g) => !isOpen(g)).length
  const shown = gateways.filter(
    (gateway) =>
      !query ||
      [
        gateway.name,
        gateway.pikkuFuncId,
        gateway.type,
        gateway.platform,
        gateway.route,
        ...(gateway.tags ?? []),
      ].some((value) => value?.toLowerCase().includes(query))
  )

  return (
    <CardsPage>
      {!loading && !query && (
        <SummaryCard
          testId="gateways-summary"
          title={
            total === 1
              ? m.gateway_page_hero_title_one()
              : m.gateway_page_hero_title({ count: total })
          }
          blurb={m.gateway_page_hero_body()}
          facts={[
            {
              label: m.gateway_page_fact_gateways(),
              value: asI18n(String(total)),
            },
            {
              label: m.gateway_page_fact_chats(),
              value: asI18n(String(chats)),
            },
            {
              label: m.gateway_page_fact_webhooks(),
              value: asI18n(String(webhooks)),
            },
            {
              label: m.gateway_page_fact_signed_in(),
              value: m.gateway_page_fact_of({ done: signedIn, total }),
              tone: signedIn < total ? 'warn' : undefined,
            },
          ]}
        />
      )}
      <SectionCard
        testId="gateways-list"
        title={m.gateways_title()}
        subtitle={
          shown.length === 1
            ? m.gateway_page_count_one()
            : m.gateway_page_count({ count: shown.length })
        }
        blurb={m.gateway_page_list_blurb()}
        footer={
          <ForDevelopers
            attached
            hint={m.gateway_page_dev_hint()}
            testId="gateways-developers"
          >
            <DevTable
              columns={[
                m.gateway_page_dev_col_name(),
                m.gateway_page_dev_col_type(),
                m.gateway_page_dev_col_address(),
                m.gateway_page_dev_col_function(),
              ]}
              rows={gateways.map((gateway) => ({
                key: gateway.name,
                cells: [
                  <DevMono key="name" value={gateway.name} copy />,
                  <DevMono key="type" value={gateway.type ?? '—'} />,
                  <DevMono key="route" value={gateway.route ?? '—'} />,
                  <DevMono key="func" value={gateway.pikkuFuncId ?? '—'} />,
                ],
              }))}
            />
          </ForDevelopers>
        }
      >
        <Stack gap="xs" mt="md">
          {shown.length === 0 ? (
            <Text size="sm" c="dimmed">
              {m.gateway_page_no_matches({ query: searchQuery.trim() })}
            </Text>
          ) : (
            shown.map((gateway) => {
              const Icon =
                TYPE_ICON[gateway.type as keyof typeof TYPE_ICON] ?? Network
              return (
                <CardRow
                  key={gateway.name}
                  testId={`gateway-row-${gateway.name}`}
                  leading={
                    <StatusTile tone={isOpen(gateway) ? 'warn' : 'info'}>
                      <Icon size={18} />
                    </StatusTile>
                  }
                  title={asI18n(toEnglishName(gateway.name))}
                  badges={
                    <>
                      {isOpen(gateway) ? (
                        <StatusBadge tone="warn" size="sm">
                          {m.gateway_page_badge_open()}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="good" size="sm">
                          {m.gateway_page_badge_signed_in()}
                        </StatusBadge>
                      )}
                      {gateway.platform && (
                        <StatusBadge tone="neutral" size="sm">
                          {asI18n(gateway.platform)}
                        </StatusBadge>
                      )}
                    </>
                  }
                  meta={
                    <>
                      {describe(gateway)}
                      {gateway.pikkuFuncId && (
                        <>
                          {asI18n(' · ')}
                          {m.gateway_page_meta_answered_by({
                            name: toEnglishName(gateway.pikkuFuncId),
                          })}
                        </>
                      )}
                    </>
                  }
                  onClick={() => openGateway(gateway.name, gateway)}
                />
              )
            })
          )}
        </Stack>
      </SectionCard>
    </CardsPage>
  )
}
