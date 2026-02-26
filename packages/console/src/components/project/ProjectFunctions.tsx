import React, { useMemo } from 'react'
import { Text, Group } from '@mantine/core'
import { FunctionSquare } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { funcWrapperDefs } from '@/components/ui/badge-defs'

interface ProjectFunctionsProps {
  functions: any[]
  functionUsedBy?: Map<string, any>
}

export const ProjectFunctions: React.FunctionComponent<
  ProjectFunctionsProps
> = ({ functions, functionUsedBy: functionUsedByProp }) => {
  const { openFunction } = usePanelContext()
  const { functionUsedBy: functionUsedByMeta } = usePikkuMeta()
  const functionUsedBy = functionUsedByProp ?? functionUsedByMeta

  const filtered = useMemo(() => {
    if (!functions) return []
    return functions.filter((func) => {
      const id = func.pikkuFuncId || func.pikkuFuncId
      return (
        (!func.functionType || func.functionType === 'user') &&
        !id?.startsWith('pikku')
      )
    })
  }, [functions])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (func: any) => {
          const funcId = func.pikkuFuncName || func.pikkuFuncId
          return (
            <>
              <Text fw={500} truncate>
                {funcId}
              </Text>
              <Text
                size="xs"
                c="dimmed"
                truncate
                style={
                  !func.summary && !func.description
                    ? { opacity: 0.4 }
                    : undefined
                }
              >
                {func.summary || func.description || 'No description'}
              </Text>
            </>
          )
        },
      },
      {
        key: 'type',
        header: 'TYPE',
        width: 160,
        render: (func: any) => (
          <Group gap={6} wrap="nowrap">
            {funcWrapperDefs[func.funcWrapper] && (
              <PikkuBadge type="funcWrapper" value={func.funcWrapper} />
            )}
            {func.expose === true && <PikkuBadge type="flag" flag="exposed" />}
            {func.internal === true && (
              <PikkuBadge type="flag" flag="internal" />
            )}
          </Group>
        ),
      },
      {
        key: 'auth',
        header: 'AUTH',
        width: 70,
        render: (func: any) =>
          func.sessionless !== true ? (
            <PikkuBadge type="flag" flag="auth" />
          ) : null,
      },
      {
        key: 'permissions',
        header: 'PERMISSIONS',
        width: 110,
        render: (func: any) =>
          func.permissions?.length > 0 ? (
            <PikkuBadge type="flag" flag="permissioned" />
          ) : null,
      },
      {
        key: 'wirings',
        header: 'WIRINGS',
        width: 90,
        render: (func: any) => {
          const funcId = func.pikkuFuncName || func.pikkuFuncId
          const usedBy = functionUsedBy.get(funcId)
          const usedByCount = usedBy
            ? usedBy.transports.length + usedBy.jobs.length
            : 0
          if (usedByCount === 0) return null
          return (
            <PikkuBadge type="dynamic" badge="wirings" value={usedByCount} />
          )
        },
      },
    ],
    [functionUsedBy]
  )

  return (
    <TableListPage
      title="Functions"
      icon={FunctionSquare}
      docsHref="https://pikku.dev/docs/core-features/functions"
      data={filtered}
      columns={columns}
      getKey={(func) => func.pikkuFuncName || func.pikkuFuncId}
      onRowClick={(func) =>
        openFunction(func.pikkuFuncName || func.pikkuFuncId, func)
      }
      searchPlaceholder="Search functions..."
      searchFilter={(func, q) =>
        func.pikkuFuncId?.toLowerCase().includes(q) ||
        func.summary?.toLowerCase().includes(q) ||
        func.description?.toLowerCase().includes(q)
      }
      emptyMessage="No functions found."
    />
  )
}
