import React, { useMemo } from 'react'
import { Text, Group } from '@pikku/mantine/core'
import { Layers } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

interface MiddlewareItem {
  id: string
  name: string
  data: any
}

export const MiddlewareTab: React.FC<{ searchQuery: string }> = ({
  searchQuery,
}) => {
  const { meta, loading } = usePikkuMeta()
  useLocale()
  const { openMiddleware } = usePanelContext()

  const allItems = useMemo((): MiddlewareItem[] => {
    if (!meta.middlewareGroupsMeta) return []
    const definitions = meta.middlewareGroupsMeta.definitions || {}
    const result: MiddlewareItem[] = []
    for (const [defId, def] of Object.entries(definitions) as [string, any][]) {
      if (def.exportedName === null) continue
      result.push({
        id: `middleware::def::${defId}`,
        name: def.name || def.exportedName || defId,
        data: { ...def, _id: defId },
      })
    }
    return result
  }, [meta.middlewareGroupsMeta])

  const items = useMemo(() => {
    if (!searchQuery) return allItems
    const q = searchQuery.toLowerCase()
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.data?.description?.toLowerCase().includes(q)
    )
  }, [allItems, searchQuery])

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
      emptyMessage={m.middleware_empty_message()}
      loading={loading}
    />
  )
}
