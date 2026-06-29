import React, { useMemo } from 'react'
import { Text, Group } from '@pikku/mantine/core'
import { Shield } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

interface PermissionItem {
  id: string
  name: string
  data: any
}

const PermissionsTable: React.FC<{
  items: PermissionItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openPermission } = usePanelContext()
  const { t } = useI18n()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: PermissionItem) => (
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
      docsHref="https://pikku.dev/docs/core-features/permission-guards"
      data={items}
      columns={columns}
      getKey={(item) => item.id}
      onRowClick={(item) => openPermission(item.id, item.data)}
      searchPlaceholder={t('permissions.search_placeholder')}
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.data?.description?.toLowerCase().includes(q)
      }
      emptyMessage={t('permissions.empty_message')}
      loading={loading}
    />
  )
}

export const PermissionsPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  const { t } = useI18n()

  const items = useMemo((): PermissionItem[] => {
    if (!meta.permissionsGroupsMeta) return []
    const definitions = meta.permissionsGroupsMeta.definitions || {}
    const result: PermissionItem[] = []

    for (const [defId, def] of Object.entries(definitions) as [string, any][]) {
      if (def.exportedName === null) continue
      result.push({
        id: `permission::def::${defId}`,
        name: def.name || def.exportedName || defId,
        data: { ...def, _id: defId },
      })
    }

    return result
  }, [meta.permissionsGroupsMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={<ListPageHeader title={t('permissions.title')} description={t('permissions.description')} />}
        hidePanel={!loading && items.length === 0}
        emptyPanelMessage={t('permissions.select_item')}
      >
        <PermissionsTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
