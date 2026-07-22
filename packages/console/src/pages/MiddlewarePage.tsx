import React, { useMemo } from 'react'
import { Text, Group } from '@pikku/mantine/core'
import { Layers } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

interface MiddlewareItem {
  id: string
  name: string
  data: any
}

const MiddlewareTable: React.FC<{
  items: MiddlewareItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openMiddleware } = usePanelContext()
  useLocale()

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
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.data?.description?.toLowerCase().includes(q)
      }
      emptyMessage={m.middleware_empty_message()}
      loading={loading}
    />
  )
}

export const MiddlewarePage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  useLocale()

  const items = useMemo((): MiddlewareItem[] => {
    if (!meta.middlewareGroupsMeta) return []
    const definitions = meta.middlewareGroupsMeta.definitions || {}
    const result: MiddlewareItem[] = []
    for (const [defId, def] of Object.entries(definitions) as [string, any][]) {
      result.push({
        id: `middleware::def::${defId}`,
        name: def.name || def.exportedName || defId,
        data: { ...def, _id: defId },
      })
    }

    return result
  }, [meta.middlewareGroupsMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.middleware_title()}
            description={m.middleware_description()}
          />
        }
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={m.middleware_select_item()}
      >
        <MiddlewareTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
