import React, { useMemo } from 'react'
import { Group, Badge } from '@mantine/core'
import { httpMethodDefs } from '@/components/ui/badge-defs'

interface HttpStatsBarProps {
  routes: any[]
}

export const HttpStatsBar: React.FunctionComponent<HttpStatsBarProps> = ({
  routes,
}) => {
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of routes) {
      const method = (r.method || 'GET').toUpperCase()
      map[method] = (map[method] || 0) + 1
    }
    return map
  }, [routes])

  return (
    <Group gap="xs">
      <Badge variant="light" color="gray" size="sm" tt="none">
        {routes.length} total
      </Badge>
      {Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([method, count]) => {
          const def = httpMethodDefs[method]
          return (
            <Badge
              key={method}
              variant="light"
              color={def?.color || 'gray'}
              size="sm"
              tt="none"
            >
              {count} {method}
            </Badge>
          )
        })}
    </Group>
  )
}
