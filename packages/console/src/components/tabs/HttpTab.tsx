import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { Globe } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export const HttpTab: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()
  const { openHTTPWire } = usePanelContext()

  const routes = useMemo(() => {
    if (!meta.httpMeta) return []
    return [...meta.httpMeta].sort((a, b) => a.route.localeCompare(b.route))
  }, [meta.httpMeta])

  const columns = useMemo(
    () => [
      {
        key: 'route',
        header: 'ROUTE',
        render: (route: any) => (
          <>
            <Text fw={500} truncate>
              {route.route}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {route.pikkuFuncId}
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
      searchPlaceholder="Search HTTP routes..."
      searchFilter={(route, q) =>
        route.route?.toLowerCase().includes(q) ||
        route.pikkuFuncId?.toLowerCase().includes(q) ||
        route.method?.toLowerCase().includes(q)
      }
      emptyMessage="No HTTP routes found."
      loading={loading}
    />
  )
}
