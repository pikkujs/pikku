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

interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  width?: string | number
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
  loading?: boolean
  headerRight?: React.ReactNode
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
  loading = false,
}: TableListPageProps<T>) => {
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    if (!searchQuery || !searchFilter) return data
    const query = searchQuery.toLowerCase()
    return data.filter((item) => searchFilter(item, query))
  }, [data, searchQuery, searchFilter])

  if (loading) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    )
  }

  if (data.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={icon}
        title={emptyTitle || `Configure ${title}`}
        description={
          emptyDescription || `No ${title.toLowerCase()} are configured yet.`
        }
        docsHref={docsHref}
      />
    )
  }

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <Box
        px="md"
        py="sm"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <TextInput
          placeholder={searchPlaceholder}
          leftSection={<Search size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Box>
      {filtered.length === 0 ? (
        <Box p="xl">
          <Text c="dimmed" ta="center">
            {searchQuery
              ? `No results found for "${searchQuery}"`
              : emptyMessage}
          </Text>
        </Box>
      ) : (
        <Table highlightOnHover withRowBorders>
          <Table.Thead>
            <Table.Tr>
              {columns.map((col, i) => (
                <Table.Th
                  key={col.key}
                  pl={i === 0 ? 'md' : undefined}
                  pr={i === columns.length - 1 ? 'md' : undefined}
                  fw={600}
                  fz="xs"
                  style={col.width ? { width: col.width } : undefined}
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
                style={{ cursor: 'pointer', height: '3.75rem' }}
                onClick={() => onRowClick(item)}
              >
                {columns.map((col, i) => (
                  <Table.Td
                    key={col.key}
                    pl={i === 0 ? 'md' : undefined}
                    pr={i === columns.length - 1 ? 'md' : undefined}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.render(item, index)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}
