import React, { useState, useMemo } from 'react'
import {
  Box,
  Stack,
  Text,
  TextInput,
  Table,
  Center,
  Loader,
} from '@pikku/mantine/core'
import type { I18nNode, I18nString } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
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
  /** When provided, rows become keyboard-operable buttons; omit for read-only tables. */
  onRowClick?: (item: T) => void
  searchPlaceholder?: I18nString
  searchFilter?: (item: T, query: string) => boolean
  /** When provided, the internal search input is hidden and this value is used for filtering */
  externalSearch?: string
  emptyMessage?: I18nNode
  emptyTitle?: I18nNode
  emptyDescription?: I18nNode
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
  searchPlaceholder,
  searchFilter,
  externalSearch,
  emptyMessage,
  emptyTitle,
  emptyDescription,
  emptyHero,
  loading = false,
  description,
  headerRight,
}: TableListPageProps<T>) => {
  const gate = usePageGate()
  useLocale()
  const [internalSearch, setInternalSearch] = useState('')
  const searchQuery = externalSearch !== undefined ? externalSearch : internalSearch

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
        title={emptyTitle ?? asI18n(`No ${title} found`)}
        description={emptyDescription ?? asI18n(`No ${title.toLowerCase()} exist yet.`)}
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
      {(searchFilter && externalSearch === undefined || headerRight) && (
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
          {searchFilter && externalSearch === undefined && (
            <TextInput
              placeholder={searchPlaceholder ?? m.common_search()}
              leftSection={<Search size={14} />}
              value={internalSearch}
              onChange={(e) => setInternalSearch(e.target.value)}
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
              ? asI18n(`No results found for "${searchQuery}"`)
              : (emptyMessage ?? m.common_no_items())}
          </Text>
        </Box>
      ) : (
        <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table highlightOnHover={!!onRowClick} withRowBorders className={classes.tableLastRowBorder}>
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
                  className={onRowClick ? classes.clickableText : undefined}
                  style={{ height: '3.75rem' }}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRowClick(item)
                          }
                        }
                      : undefined
                  }
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
