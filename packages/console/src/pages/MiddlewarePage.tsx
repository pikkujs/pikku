import React, { useMemo } from 'react'
import { Text, Group } from '@mantine/core'
import { Layers } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface MiddlewareItem {
  id: string
  name: string
  data: any
}

const MiddlewareTable: React.FunctionComponent<{
  items: MiddlewareItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openMiddleware } = usePanelContext()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: MiddlewareItem) => (
          <>
            <Text fw={500} truncate>
              {item.name}
            </Text>
            {item.data?.description && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                {item.data.description}
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
              {item.data?.exportedName === null && (
                <PikkuBadge type="flag" flag="local" />
              )}
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
      docsHref="https://pikkujs.com/docs/middleware"
      data={items}
      columns={columns}
      getKey={(item) => item.id}
      onRowClick={(item) => openMiddleware(item.id, item.data)}
      searchPlaceholder="Search middleware..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.data?.description?.toLowerCase().includes(q)
      }
      emptyMessage="No middleware found."
      loading={loading}
    />
  )
}

export const MiddlewarePage: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): MiddlewareItem[] => {
    if (!meta.middlewareGroupsMeta) return []
    const definitions = meta.middlewareGroupsMeta.definitions || {}
    const instances = meta.middlewareGroupsMeta.instances || {}
    const seen = new Set<string>()
    const result: MiddlewareItem[] = []

    for (const [defId, def] of Object.entries(definitions) as [string, any][]) {
      seen.add(defId)
      result.push({
        id: `middleware::def::${defId}`,
        name: def.name || def.exportedName || defId,
        data: { ...def, _id: defId },
      })
    }

    for (const [, inst] of Object.entries(instances) as [string, any][]) {
      const defId = inst.definitionId
      if (defId && !seen.has(defId)) {
        seen.add(defId)
        result.push({
          id: `middleware::def::${defId}`,
          name: defId,
          data: {
            _id: defId,
            name: defId,
            sourceFile: inst.sourceFile,
            isFactoryCall: inst.isFactoryCall,
          },
        })
      }
    }

    return result
  }, [meta.middlewareGroupsMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Layers}
            category="Middleware"
            docsHref="https://pikkujs.com/docs/middleware"
          />
        }
        showTabs={false}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage="Select a middleware to view its details"
      >
        <MiddlewareTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
