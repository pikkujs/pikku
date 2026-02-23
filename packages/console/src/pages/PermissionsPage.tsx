import React, { useMemo } from 'react'
import { Text, Group } from '@mantine/core'
import { Shield } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface PermissionItem {
  id: string
  name: string
  data: any
}

const PermissionsTable: React.FunctionComponent<{
  items: PermissionItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openPermission } = usePanelContext()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: PermissionItem) => (
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
        render: (item: PermissionItem) => {
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
      title="Permissions"
      icon={Shield}
      docsHref="https://pikkujs.com/docs/permissions"
      data={items}
      columns={columns}
      getKey={(item) => item.id}
      onRowClick={(item) => openPermission(item.id, item.data)}
      searchPlaceholder="Search permissions..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.data?.description?.toLowerCase().includes(q)
      }
      emptyMessage="No permissions found."
      loading={loading}
    />
  )
}

export const PermissionsPage: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): PermissionItem[] => {
    if (!meta.permissionsGroupsMeta) return []
    const definitions = meta.permissionsGroupsMeta.definitions || {}
    const httpGroups = meta.permissionsGroupsMeta.httpGroups || {}
    const tagGroups = meta.permissionsGroupsMeta.tagGroups || {}
    const seen = new Set<string>()
    const result: PermissionItem[] = []

    for (const [defId, def] of Object.entries(definitions) as [string, any][]) {
      seen.add(defId)
      result.push({
        id: `permission::def::${defId}`,
        name: def.name || def.exportedName || defId,
        data: { ...def, _id: defId },
      })
    }

    for (const group of [
      ...Object.values(httpGroups),
      ...Object.values(tagGroups),
    ] as any[]) {
      for (const instanceId of group.instanceIds || []) {
        if (!seen.has(instanceId)) {
          seen.add(instanceId)
          result.push({
            id: `permission::def::${instanceId}`,
            name: instanceId,
            data: {
              _id: instanceId,
              name: instanceId,
              sourceFile: group.sourceFile,
            },
          })
        }
      }
    }

    return result
  }, [meta.permissionsGroupsMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Shield}
            category="Permissions"
            docsHref="https://pikkujs.com/docs/permissions"
          />
        }
        showTabs={false}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage="Select a permission to view its details"
      >
        <PermissionsTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
