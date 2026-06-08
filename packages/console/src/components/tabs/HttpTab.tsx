import React, { useMemo, useState } from 'react'
import { Box, Text, Table, Group } from '@mantine/core'
import { Allotment } from 'allotment'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { PikkuBadge } from '../ui/PikkuBadge'
import { HttpTabbedPanel } from '../http/HttpTabbedPanel'
import { EmptyState } from '../ui/EmptyState'
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

  return (
    <Box style={{ flex: 1, minHeight: 0, display: 'flex', gap: 'var(--mantine-spacing-md)' }}>
      <Allotment defaultSizes={[360, 1000]}>
        <Allotment.Pane minSize={160}>
          <Box className={styles.listSurfaceCard} style={{ height: '100%', overflow: 'auto' }}>
            <Table highlightOnHover withRowBorders className={styles.tableLastRowBorder}>
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
                      <Table.Td pl="md" pr="md">
                        <Group gap={5} wrap="nowrap" mb={2}>
                          <PikkuBadge
                            type="httpMethod"
                            value={route.method?.toUpperCase() || 'GET'}
                            size="xs"
                          />
                          <Text
                            size="xs"
                            ff="monospace"
                            truncate
                            c={isActive ? 'var(--app-meta-value)' : undefined}
                          >
                            {route.route}
                          </Text>
                        </Group>
                        <Text
                          size="xs"
                          ff="monospace"
                          c={isActive ? 'var(--app-meta-label)' : 'dimmed'}
                          truncate
                        >
                          {route.pikkuFuncId}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Box>
        </Allotment.Pane>
        <Allotment.Pane minSize={300}>
          <Box className={styles.listSurfaceCard} style={{ height: '100%', overflow: 'auto' }}>
            {selectedRoute ? (
              <HttpTabbedPanel
                wireId={`${selectedRoute.method}::${selectedRoute.route}`}
                metadata={selectedRoute}
              />
            ) : (
              <EmptyState title="Select a route to view its details" />
            )}
          </Box>
        </Allotment.Pane>
      </Allotment>
    </Box>
  )
}
