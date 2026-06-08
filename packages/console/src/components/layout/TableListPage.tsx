import React, { useState, useMemo } from 'react'
import {
  Box,
  Stack,
  Text,
  TextInput,
  Table,
  Center,
  Loader,
} from '@mantine/core'
import { Search } from 'lucide-react'
import { EmptyStatePlaceholder } from './EmptyStatePlaceholder'
import { usePageGate } from '../../context/PageGateContext'
import classes from '../ui/console.module.css'

interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  width?: string | number
  maxWidth?: string | number
  render: (item: T, index: number) => React.ReactNode
}

interface TableListPageProps<T> {
  icon: React.ComponentType<{ size?: number }>
  title: string
  docsHref: string
  data: T[]
  columns: Column<T>[]
  getKey: (item: T, index: number) => string
  onRowClick: (item: T) => void
  searchPlaceholder?: string
  searchFilter?: (item: T, query: string) => boolean
  emptyMessage?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyHero?: React.ReactNode
  loading?: boolean
  headerRight?: React.ReactNode
  description?: React.ReactNode
}

export const TableListPage = <T,>({
  icon,
  title,
  docsHref,
  data,
  columns,
  getKey,
  onRowClick,
  searchPlaceholder = 'Search...',
  searchFilter,
  emptyMessage = 'No items found.',
  emptyTitle,
  emptyDescription,
  emptyHero,
  loading = false,
  description,
  headerRight,
}: TableListPageProps<T>) => {
  const gate = usePageGate()
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    if (!searchQuery || !searchFilter) return data
    const query = searchQuery.toLowerCase()
    return data.filter((item) => searchFilter(item, query))
  }, [data, searchQuery, searchFilter])

  if (gate) {
    return <>{gate}</>
  }

  if (loading) {
    return (
      <Box className={classes.listSurfaceCard}>
        <Center h="100%">
          <Loader />
        </Center>
      </Box>
    )
  }

  if (data.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={icon}
        hero={emptyHero}
        title={emptyTitle || `No ${title} found`}
        description={emptyDescription ?? `No ${title.toLowerCase()} exist yet.`}
        docsHref={docsHref}
      />
    )
  }

  return (
    <Box className={classes.listSurfaceCard}>
    <Stack gap={0} className={classes.flexColumn}>
      {description && (
        <Box
          px="md"
          py="xs"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          {description}
        </Box>
      )}
      {(searchFilter || headerRight) && (
        <Box
          px="md"
          style={{
            height: 42,
            borderBottom: '1px solid var(--mantine-color-default-border)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {searchFilter && (
            <TextInput
              placeholder={searchPlaceholder}
              leftSection={<Search size={14} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={classes.flexGrow}
              size="sm"
            />
          )}
          {headerRight}
        </Box>
      )}
      {filtered.length === 0 ? (
        <Box p="xl">
          <Text c="dimmed" ta="center">
            {searchQuery
              ? `No results found for "${searchQuery}"`
              : emptyMessage}
          </Text>
        </Box>
      ) : (
        <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table highlightOnHover withRowBorders className={classes.tableLastRowBorder}>
            <Table.Thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--mantine-color-body)' }}>
              <Table.Tr style={{ height: 42 }}>
                {columns.map((col, i) => (
                  <Table.Th
                    key={col.key}
                    pl={i === 0 ? 'md' : undefined}
                    pr={i === columns.length - 1 ? 'md' : undefined}
                    fw={600}
                    fz="sm"
                    style={{ ...(col.width ? { width: col.width } : {}), ...(col.maxWidth ? { maxWidth: col.maxWidth } : {}) }}
                  >
                    {col.header}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((item, index) => (
                <Table.Tr
                  key={getKey(item, index)}
                  className={classes.clickableText}
                  style={{ height: '3.75rem' }}
                  onClick={() => onRowClick(item)}
                >
                  {columns.map((col, i) => (
                    <Table.Td
                      key={col.key}
                      pl={i === 0 ? 'md' : undefined}
                      pr={i === columns.length - 1 ? 'md' : undefined}
                      style={{ ...(col.width ? { width: col.width } : {}), ...(col.maxWidth ? { maxWidth: col.maxWidth } : {}) }}
                    >
                      {col.render(item, index)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </Stack>
    </Box>
  )
}
