import React, { useMemo, useState } from 'react'
import { Box, Text, TextInput, Stack, UnstyledButton, ScrollArea } from '@mantine/core'
import { Search } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { PikkuBadge } from '../ui/PikkuBadge'
import { HttpTabbedPanel } from '../http/HttpTabbedPanel'

export const HttpTab: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta()
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const routes = useMemo(() => {
    if (!meta.httpMeta) return []
    return [...meta.httpMeta].sort((a: any, b: any) => a.route.localeCompare(b.route))
  }, [meta.httpMeta])

  const filtered = useMemo(() => {
    if (!search) return routes
    const q = search.toLowerCase()
    return routes.filter(
      (r: any) =>
        r.route?.toLowerCase().includes(q) ||
        r.pikkuFuncId?.toLowerCase().includes(q) ||
        r.method?.toLowerCase().includes(q)
    )
  }, [routes, search])

  const selectedRoute = useMemo(() => {
    if (!selected) return null
    return routes.find((r: any) => `${r.method}::${r.route}` === selected) || null
  }, [routes, selected])

  return (
    <Box style={{ display: 'flex', height: '100%' }}>
      <Box
        style={{
          width: 280,
          minWidth: 220,
          borderRight: '1px solid var(--mantine-color-default-border)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Box p="xs">
          <TextInput
            placeholder="Search routes..."
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
          />
        </Box>
        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={0}>
            {filtered.map((route: any) => {
              const key = `${route.method}::${route.route}`
              const isActive = selected === key
              return (
                <UnstyledButton
                  key={key}
                  onClick={() => setSelected(key)}
                  px="sm"
                  py={6}
                  style={{
                    backgroundColor: isActive
                      ? 'var(--mantine-color-dark-5)'
                      : undefined,
                    borderLeft: isActive
                      ? '2px solid var(--mantine-color-blue-6)'
                      : '2px solid transparent',
                  }}
                >
                  <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PikkuBadge type="httpMethod" value={route.method?.toUpperCase() || 'GET'} size="xs" />
                    <Text size="xs" truncate style={{ flex: 1 }}>
                      {route.route}
                    </Text>
                  </Box>
                  <Text size="xs" c="dimmed" truncate>
                    {route.pikkuFuncId}
                  </Text>
                </UnstyledButton>
              )
            })}
          </Stack>
        </ScrollArea>
      </Box>
      <Box style={{ flex: 1, overflow: 'auto' }}>
        {selectedRoute ? (
          <HttpTabbedPanel
            wireId={`${selectedRoute.method}::${selectedRoute.route}`}
            metadata={selectedRoute}
          />
        ) : (
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text c="dimmed">Select a route to view its details</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
