import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { Settings2 } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'

export interface VariableMeta {
  name: string
  displayName: string
  description?: string
  variableId: string
  rawData?: any
}

interface ProjectVariablesProps {
  variables: VariableMeta[]
  loading?: boolean
  installed?: boolean
  emptyHero?: React.ReactNode
}

export const ProjectVariables: React.FC<ProjectVariablesProps> = ({
  variables,
  loading,
  installed = true,
  emptyHero,
}) => {
  const { openVariable } = usePanelContext()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (v: VariableMeta) => (
          <>
            <Text fw={500} truncate>
              {v.displayName}
            </Text>
            {v.description && (
              <Text size="sm" c="dimmed" truncate>
                {v.description}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'variableId',
        header: 'VARIABLE ID',
        render: (v: VariableMeta) => (
          <Text size="sm" c="dimmed" ff="monospace">
            {v.variableId}
          </Text>
        ),
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Environment Variables"
      icon={Settings2}
      docsHref="https://pikku.dev/docs/core-features/variables"
      data={variables}
      columns={columns}
      getKey={(v) => v.name}
      onRowClick={(v) =>
        openVariable(v.name, { ...(v.rawData ?? v), installed })
      }
      emptyMessage="No variables found."
      loading={loading}
      emptyHero={emptyHero}
    />
  )
}
