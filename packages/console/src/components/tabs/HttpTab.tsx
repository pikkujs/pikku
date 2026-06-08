import React, { useMemo, useState } from 'react'
import { Box, Text, Table, ScrollArea } from '@mantine/core'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { PikkuBadge } from '../ui/PikkuBadge'
import { HttpTabbedPanel } from '../http/HttpTabbedPanel'
import { EmptyState } from '../ui/EmptyState'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import styles from '../ui/console.module.css'

type HttpTabProps = { searchQuery: string }

export const HttpTab: React.FC<HttpTabProps> = ({ searchQuery }) => {
  const { meta } = usePikkuMeta()
  const [selected, setSelected] = useState<string | null>(null)

  const routes = useMemo(() => {
    if (!meta.httpMeta) return []
    return [...meta.httpMeta].sort((a: any, b: any) =>
      a.route.localeCompare(b.route)
    )
  }, [meta.httpMeta])

  const filtered = useMemo(() => {
    if (!searchQuery) return routes
    const q = searchQuery.toLowerCase()
    return routes.filter(
      (r: any) =>
        r.route?.toLowerCase().includes(q) ||
        r.pikkuFuncId?.toLowerCase().includes(q) ||
        r.method?.toLowerCase().includes(q)
    )
  }, [routes, searchQuery])

  const selectedRoute = useMemo(() => {
    if (!selected) return null
    return (
      routes.find((r: any) => `${r.method}::${r.route}` === selected) || null
    )
  }, [routes, selected])

  const list = (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Table highlightOnHover withRowBorders className={styles.tableLastRowBorder}>
        <Table.Thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--mantine-color-body)' }}>
          <Table.Tr style={{ height: 38 }}>
            <Table.Th pl="md" fw={600} fz="xs">ROUTE</Table.Th>
            <Table.Th pr="md" fw={600} fz="xs" style={{ textAlign: 'right' }}>METHOD</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filtered.map((route: any) => {
            const key = `${route.method}::${route.route}`
            const isActive = selected === key
            return (
              <Table.Tr
                key={key}
                onClick={() => setSelected(key)}
                className={styles.clickableText}
                style={{
                  height: '3.25rem',
                  background: isActive ? 'rgba(124,58,237,0.06)' : undefined,
                  borderLeft: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                }}
              >
                <Table.Td pl="md">
                  <Text
                    size="sm"
                    ff="monospace"
                    truncate
                    c={isActive ? 'var(--app-meta-value)' : undefined}
                  >
                    {route.route}
                  </Text>
                  <Text
                    size="sm"
                    ff="monospace"
                    c={isActive ? 'var(--app-meta-label)' : 'dimmed'}
                    truncate
                  >
                    {route.pikkuFuncId}
                  </Text>
                </Table.Td>
                <Table.Td pr="md" style={{ textAlign: 'right' }}>
                  <PikkuBadge
                    type="httpMethod"
                    value={route.method?.toUpperCase() || 'GET'}
                    size="sm"
                  />
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Box>
  )

  return (
    <ListDetailLayout
      listWidth={340}
      list={list}
      detail={
        selectedRoute ? (
          <HttpTabbedPanel
            wireId={`${selectedRoute.method}::${selectedRoute.route}`}
            metadata={selectedRoute}
          />
        ) : null
      }
      hasSelection={!!selectedRoute}
      emptyMessage="Select a route to view its details"
    />
  )
}
