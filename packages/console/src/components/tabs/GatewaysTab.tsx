import React, { useMemo } from 'react'
import { Group, Text } from '@pikku/mantine/core'
import { Network } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type GatewaysTabProps = { searchQuery: string; emptyHero?: React.ReactNode }

export const GatewaysTab: React.FC<GatewaysTabProps> = ({
  searchQuery,
  emptyHero,
}) => {
  const { meta } = usePikkuMeta()
  const { openGateway } = usePanelContext()
  useLocale()

  const gateways = useMemo(() => {
    if (!meta.gatewayMeta) return []
    return [...meta.gatewayMeta]
      .filter((gateway: any) => gateway.enabled !== false)
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
  }, [meta.gatewayMeta])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (gateway: any) => (
          <>
            <Text fw={500} truncate>
              {asI18n(gateway.name)}
            </Text>
            {gateway.pikkuFuncId && (
              <Text size="xs" ff="monospace" c="dimmed" truncate>
                {asI18n(gateway.pikkuFuncId)}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'platform',
        header: 'PLATFORM',
        width: 130,
        render: (gateway: any) => (
          <Text size="sm" c="var(--app-text-muted)" truncate>
            {asI18n(gateway.platform || '—')}
          </Text>
        ),
      },
      {
        key: 'route',
        header: 'ENTRY',
        width: 190,
        render: (gateway: any) => (
          <Text size="sm" ff="monospace" c="var(--app-text-muted)" truncate>
            {asI18n(gateway.route || 'listener')}
          </Text>
        ),
      },
      {
        key: 'type',
        header: 'TYPE',
        align: 'right' as const,
        width: 110,
        render: (gateway: any) => (
          <Group gap={6} justify="flex-end" wrap="nowrap">
            <PikkuBadge type="label" color="teal" size="sm">
              {asI18n(gateway.type || 'gateway')}
            </PikkuBadge>
          </Group>
        ),
      },
    ],
    []
  )

  return (
    <TableListPage
      title={m.gateways_title()}
      icon={Network}
      docsHref="https://pikku.dev/docs/wiring/gateway"
      data={gateways}
      columns={columns}
      getKey={(gateway) => gateway.name}
      onRowClick={(gateway) => openGateway(gateway.name, gateway)}
      searchPlaceholder={m.gateways_search_placeholder()}
      searchFilter={(gateway, q) =>
        gateway.name?.toLowerCase().includes(q) ||
        gateway.pikkuFuncId?.toLowerCase().includes(q) ||
        gateway.type?.toLowerCase().includes(q) ||
        gateway.platform?.toLowerCase().includes(q) ||
        gateway.route?.toLowerCase().includes(q) ||
        (gateway.tags ?? []).some((tag: string) => tag.toLowerCase().includes(q))
      }
      emptyMessage={m.gateways_empty_message()}
      emptyHero={emptyHero}
      externalSearch={searchQuery}
    />
  )
}
