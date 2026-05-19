import React, { useMemo } from 'react'
import { Text, Tooltip, ActionIcon } from '@mantine/core'
import { Settings2, ExternalLink } from 'lucide-react'
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
}

export const ProjectVariables: React.FunctionComponent<
  ProjectVariablesProps
> = ({ variables, loading, installed = true }) => {
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
      searchPlaceholder="Search variables..."
      searchFilter={(v, q) =>
        v.name.toLowerCase().includes(q) ||
        v.displayName.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        v.variableId.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No variables found."
      loading={loading}
      headerRight={
        <Tooltip label="Environment Variables docs">
          <ActionIcon
            component="a"
            href="https://pikku.dev/docs/core-features/variables"
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            color="gray"
            size="sm"
          >
            <ExternalLink size={14} />
          </ActionIcon>
        </Tooltip>
      }
    />
  )
}
