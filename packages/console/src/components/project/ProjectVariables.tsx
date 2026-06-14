import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
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
              {asI18n(v.displayName)}
            </Text>
            {v.description && (
              <Text size="sm" c="dimmed" truncate>
                {asI18n(v.description)}
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
            {asI18n(v.variableId)}
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
      emptyMessage={asI18n('No variables found.')}
      loading={loading}
      emptyHero={emptyHero}
    />
  )
}
