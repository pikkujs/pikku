import React, { useMemo } from 'react'
import { Text, Group } from '@mantine/core'
import { Globe } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

type HttpTabProps = { searchQuery: string; emptyHero?: React.ReactNode }

export const HttpTab: React.FC<HttpTabProps> = ({ searchQuery, emptyHero }) => {
  const { meta } = usePikkuMeta()
  const { openHTTPWire } = usePanelContext()

  const routes = useMemo(() => {
    if (!meta.httpMeta) return []
    return [...meta.httpMeta].sort((a: any, b: any) =>
      a.route.localeCompare(b.route)
    )
  }, [meta.httpMeta])

  const columns = useMemo(
    () => [
      {
        key: 'route',
        header: 'ROUTE',
        render: (route: any) => (
          <>
            <Group gap={5} wrap="nowrap" mb={2}>
              <PikkuBadge
                type="httpMethod"
                value={route.method?.toUpperCase() || 'GET'}
                size="xs"
              />
              <Text size="xs" ff="monospace" fw={500} truncate>
                {route.route}
              </Text>
            </Group>
            <Text size="xs" ff="monospace" c="dimmed" truncate>
              {route.pikkuFuncId}
            </Text>
          </>
        ),
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
      searchPlaceholder="Search routes..."
      searchFilter={(route, q) =>
        route.route?.toLowerCase().includes(q) ||
        route.pikkuFuncId?.toLowerCase().includes(q) ||
        route.method?.toLowerCase().includes(q)
      }
      emptyMessage="No HTTP routes found."
      emptyHero={emptyHero}
      externalSearch={searchQuery}
    />
  )
}
