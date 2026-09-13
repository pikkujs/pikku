import React, { useMemo } from 'react'
import { Group, Text } from '@pikku/mantine/core'
import { Network } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { useGatewayItems } from '../../hooks/useGatewayItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export interface GatewaysListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every enabled gateway in the project as selectable rows. Mount anywhere under
 * a `ConsoleSurface` — it reads its own meta and opens the gateway inspector.
 */
export const GatewaysListPanel: React.FC<GatewaysListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openGateway } = usePanelContext()
  useLocale()
  const { items: gateways, loading } = useGatewayItems()

  usePanelUrl({
    type: 'gateway',
    items: gateways,
    getId: (gateway: any) => gateway.name,
    open: openGateway,
  })

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
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
        header: 'Platform',
        width: 130,
        render: (gateway: any) => (
          <Text size="sm" c="var(--app-text-dim)" truncate>
            {asI18n(gateway.platform || '—')}
          </Text>
        ),
      },
      {
        key: 'route',
        header: 'Entry',
        width: 190,
        render: (gateway: any) => (
          <Text size="sm" ff="monospace" c="var(--app-text-dim)" truncate>
            {asI18n(gateway.route || 'listener')}
          </Text>
        ),
      },
      {
        key: 'type',
        header: 'Type',
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
      externalSearch={externalSearch}
      searchFilter={(gateway, q) =>
        gateway.name?.toLowerCase().includes(q) ||
        gateway.pikkuFuncId?.toLowerCase().includes(q) ||
        gateway.type?.toLowerCase().includes(q) ||
        gateway.platform?.toLowerCase().includes(q) ||
        gateway.route?.toLowerCase().includes(q) ||
        (gateway.tags ?? []).some((tag: string) =>
          tag.toLowerCase().includes(q)
        )
      }
      emptyMessage={m.gateways_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
    />
  )
}
