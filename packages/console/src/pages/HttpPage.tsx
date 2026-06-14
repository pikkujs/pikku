import React, { useMemo } from 'react'
import { Text, Stack } from '@pikku/mantine/core'
import { Globe } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
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
  const { t } = useI18n()

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
      searchPlaceholder={t('http.search_placeholder')}
      searchFilter={(route, q) =>
        route.route?.toLowerCase().includes(q) ||
        route.pikkuFuncId?.toLowerCase().includes(q) ||
        route.method?.toLowerCase().includes(q)
      }
      emptyMessage={t('http.empty_message')}
      loading={loading}
      description={
        <Stack gap={2}>
          <Text size="sm" fw={500}>
            {t('http.description_heading')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('http.description_body')}
          </Text>
        </Stack>
      }
    />
  )
}

export const HttpPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  const { t } = useI18n()

  const routes = useMemo(() => {
    if (!meta.httpMeta) return []
    return [...meta.httpMeta].sort((a, b) => a.route.localeCompare(b.route))
  }, [meta.httpMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={<ListPageHeader title={t('http.title')} description={t('http.description')} />
        }
        hidePanel={!loading && routes.length === 0}
        emptyPanelMessage={t('http.select_route')}
      >
        <HttpTable routes={routes} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
