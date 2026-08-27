import React, { useMemo } from 'react'
import { Text, Group } from '@pikku/mantine/core'
import { Layers } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import {
  useMiddlewareItems,
  type MiddlewareItem,
} from '../../hooks/useMiddlewareItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export interface MiddlewareListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every middleware definition in the project as selectable rows. Mount anywhere
 * under a `ConsoleSurface` — it reads its own meta and opens the middleware
 * inspector.
 */
export const MiddlewareListPanel: React.FC<MiddlewareListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openMiddleware } = usePanelContext()
  useLocale()
  const { items, loading } = useMiddlewareItems()

  usePanelUrl({
    type: 'middleware',
    items,
    getId: (item) => item.id,
    open: (id, item) => openMiddleware(id, item.data),
  })

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: MiddlewareItem) => (
          <>
            <Text fw={500} truncate>
              {asI18n(item.name)}
            </Text>
            {item.data?.description && (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {asI18n(item.data.description)}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'type',
        header: 'TYPE',
        align: 'right' as const,
        render: (item: MiddlewareItem) => {
          const wireNames: string[] = item.data?.wires?.wires ?? []
          const sessionWires = new Set([
            'session',
            'setSession',
            'clearSession',
            'getSession',
            'hasSessionChanged',
          ])
          const usesSession = wireNames.some((w) => sessionWires.has(w))
          const nonSessionWires = wireNames.filter((w) => !sessionWires.has(w))
          return (
            <Group gap={4} wrap="nowrap">
              {usesSession && <PikkuBadge type="flag" flag="session" />}
              {nonSessionWires.map((w) => (
                <PikkuBadge key={w} type="dynamic" badge="wire" value={w} />
              ))}
              {item.data?.factory && <PikkuBadge type="flag" flag="factory" />}
            </Group>
          )
        },
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Middleware"
      icon={Layers}
      docsHref="https://pikku.dev/docs/core-features/middleware"
      data={items}
      columns={columns}
      getKey={(item) => item.id}
      onRowClick={(item) => openMiddleware(item.id, item.data)}
      searchPlaceholder={m.middleware_search_placeholder()}
      externalSearch={externalSearch}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.data?.description?.toLowerCase().includes(q)
      }
      emptyMessage={m.middleware_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
    />
  )
}
