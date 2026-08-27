import React, { useMemo } from 'react'
import { Text, Stack } from '@pikku/mantine/core'
import { Globe } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePanelContext } from '../../context/PanelContext'
import { usePanelUrl } from '../../hooks/usePanelUrl'
import { useHttpItems } from '../../hooks/useHttpItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export interface HttpListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every HTTP route in the project as selectable rows. Mount anywhere under a
 * `ConsoleSurface` — it reads its own meta and opens the route inspector.
 */
export const HttpListPanel: React.FC<HttpListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openHTTPWire } = usePanelContext()
  useLocale()
  const { items: routes, loading } = useHttpItems()

  usePanelUrl({
    type: 'http',
    items: routes,
    getId: (route: any) => `http::${route.method}::${route.route}`,
    open: openHTTPWire,
  })

  const columns = useMemo(
    () => [
      {
        key: 'route',
        header: 'ROUTE',
        render: (route: any) => (
          <>
            <Text fw={500} truncate>
              {asI18n(route.route)}
            </Text>
            <Text size="sm" c="dimmed" truncate>
              {asI18n(route.pikkuFuncId)}
            </Text>
          </>
        ),
      },
      {
        key: 'method',
        header: 'METHOD',
        align: 'right' as const,
        render: (route: any) => {
          const method = route.method?.toUpperCase() || 'GET'
          return <PikkuBadge type="httpMethod" value={method} />
        },
      },
    ],
    []
  )

  return (
    <TableListPage
      title="HTTP Routes"
      icon={Globe}
      docsHref="https://pikku.dev/docs/wiring/http"
      data={routes}
      columns={columns}
      getKey={(route) => `${route.method}::${route.route}`}
      onRowClick={(route) =>
        openHTTPWire(`http::${route.method}::${route.route}`, route)
      }
      searchPlaceholder={m.http_search_placeholder()}
      externalSearch={externalSearch}
      searchFilter={(route, q) =>
        route.route?.toLowerCase().includes(q) ||
        route.pikkuFuncId?.toLowerCase().includes(q) ||
        route.method?.toLowerCase().includes(q)
      }
      emptyMessage={m.http_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
      description={
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            {m.http_description_heading()}
          </Text>
          <Text size="sm" c="dimmed">
            {m.http_description_body()}
          </Text>
        </Stack>
      }
    />
  )
}
