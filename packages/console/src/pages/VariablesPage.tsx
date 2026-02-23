import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { Variable } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'

interface VariableItem {
  name: string
  displayName: string
  description?: string
  variableId: string
  rawData: any
}

const VariablesTable: React.FunctionComponent<{
  items: VariableItem[]
  loading?: boolean
}> = ({ items, loading }) => {
  const { openVariable } = usePanelContext()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: VariableItem) => (
          <>
            <Text fw={500} truncate>
              {item.displayName}
            </Text>
            {item.description && (
              <Text size="xs" c="dimmed" truncate>
                {item.description}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'variableId',
        header: 'ID',
        align: 'right' as const,
        render: (item: VariableItem) => (
          <Text size="xs" c="dimmed" ff="monospace">
            {item.variableId}
          </Text>
        ),
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Variables"
      icon={Variable}
      docsHref="https://pikkujs.com/docs/variables"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openVariable(item.name, item.rawData)}
      searchPlaceholder="Search variables..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.displayName.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.variableId.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No variables found."
      loading={loading}
    />
  )
}

const VariablesPageContent: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): VariableItem[] => {
    if (!meta.variablesMeta) return []
    return Object.entries(meta.variablesMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName,
        description: data.description,
        variableId: data.variableId,
        rawData: data,
      })
    )
  }, [meta.variablesMeta])

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Variable}
          category="Variables"
          docsHref="https://pikkujs.com/docs/variables"
        />
      }
    >
      <VariablesTable items={items} loading={loading} />
    </ResizablePanelLayout>
  )
}

export const VariablesPage: React.FunctionComponent = () => {
  return (
    <PanelProvider>
      <VariablesPageContent />
    </PanelProvider>
  )
}
