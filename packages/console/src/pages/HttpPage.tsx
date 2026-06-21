import React, { useMemo } from 'react'
import { Text, Stack } from '@pikku/mantine/core'
import { Globe } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider } from '../context/PanelContext'
import { usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

const HttpTable: React.FC<{
  routes: any[]
  loading?: boolean
}> = ({ routes, loading }) => {
  const { openHTTPWire } = usePanelContext()
  useLocale()

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
      searchFilter={(route, q) =>
        route.route?.toLowerCase().includes(q) ||
        route.pikkuFuncId?.toLowerCase().includes(q) ||
        route.method?.toLowerCase().includes(q)
      }
      emptyMessage={m.http_empty_message()}
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

export const HttpPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  useLocale()

  const routes = useMemo(() => {
    if (!meta.httpMeta) return []
    return [...meta.httpMeta].sort((a, b) => a.route.localeCompare(b.route))
  }, [meta.httpMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={<ListPageHeader title={m.http_title()} description={m.http_description()} />
        }
        hidePanel={!loading && routes.length === 0}
        emptyPanelMessage={m.http_select_route()}
      >
        <HttpTable routes={routes} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
