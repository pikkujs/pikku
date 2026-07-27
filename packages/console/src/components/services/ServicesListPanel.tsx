import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Server } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useServiceItems, type ServiceItem } from '../../hooks/useServiceItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export interface ServicesListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every service used by a function in the project, ranked by usage. Read-only —
 * services have no inspector, so rows do not open a panel.
 */
export const ServicesListPanel: React.FC<ServicesListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  useLocale()
  const { items: services, loading } = useServiceItems()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: ServiceItem) => <Text fw={500}>{asI18n(item.name)}</Text>,
      },
      {
        key: 'functions',
        header: 'FUNCTIONS',
        align: 'right' as const,
        render: (item: ServiceItem) => (
          <PikkuBadge type="dynamic" badge="functions" value={item.funcCount} />
        ),
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Services"
      icon={Server}
      docsHref="https://pikku.dev/docs/core-features/services"
      data={services}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={() => {}}
      searchPlaceholder={m.services_search_placeholder()}
      externalSearch={externalSearch}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.functions.some((f) => f.toLowerCase().includes(q))
      }
      emptyMessage={m.services_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
    />
  )
}
