import React, { useState, useMemo, useEffect, useRef } from 'react'
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
import { useListSurfaceClass } from '../../context/ConsoleChromeContext'
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
  /**
   * Extra attributes for one row, so a caller can identify a row by the record
   * it renders rather than by the text that happens to be in it.
   */
  getRowProps?: (item: T, index: number) => Record<string, string>
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
  /**
   * Fetch the next page. Called when the sentinel below the last row scrolls
   * into view, so a list that pages server-side keeps one table render path
   * rather than growing a second one.
   *
   * `searchFilter` still filters only what has been loaded — it is a client-side
   * narrowing, so a paged list should filter server-side instead of relying on
   * it, or a match on an unloaded page will not be found.
   */
  onLoadMore?: () => void
  /** Whether another page exists. No sentinel is rendered when false. */
  hasMore?: boolean
  /** A fetch is already in flight; suppresses re-triggering and shows a spinner. */
  loadingMore?: boolean
}

export const TableListPage = <T,>({
  icon,
  title,
  docsHref,
  data,
  columns,
  getKey,
  getRowProps,
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
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: TableListPageProps<T>) => {
  const gate = usePageGate()
  const surfaceClass = useListSurfaceClass()
  useLocale()
  const [internalSearch, setInternalSearch] = useState('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Read through a ref so the observer is not torn down and rebuilt on every
  // render — re-observing mid-scroll fires an immediate intersection and would
  // request the same page twice.
  const loadMoreRef = useRef<(() => void) | undefined>(onLoadMore)
  loadMoreRef.current =
    onLoadMore && hasMore && !loadingMore ? onLoadMore : undefined

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreRef.current?.()
      }
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])
  const searchQuery =
    externalSearch !== undefined ? externalSearch : internalSearch

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
      <Box className={surfaceClass}>
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
        description={
          emptyDescription ?? asI18n(`No ${title.toLowerCase()} exist yet.`)
        }
        docsHref={docsHref}
      />
    )
  }

  return (
    <Box className={surfaceClass}>
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
        {((searchFilter && externalSearch === undefined) || headerRight) && (
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
            <Table
              data-testid="data-table"
              highlightOnHover={!!onRowClick}
              withRowBorders
              className={classes.tableLastRowBorder}
            >
              <Table.Thead
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: 'var(--mantine-color-body)',
                }}
              >
                <Table.Tr style={{ height: 42 }}>
                  {columns.map((col, i) => (
                    <Table.Th
                      key={col.key}
                      pl={i === 0 ? 'md' : undefined}
                      pr={i === columns.length - 1 ? 'md' : undefined}
                      fw={600}
                      fz="sm"
                      style={{
                        ...(col.width ? { width: col.width } : {}),
                        ...(col.maxWidth ? { maxWidth: col.maxWidth } : {}),
                      }}
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
                    {...getRowProps?.(item, index)}
                    data-interactive={onRowClick ? 'true' : 'false'}
                    className={onRowClick ? classes.clickableText : undefined}
                    style={{ height: '3.75rem' }}
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
                        style={{
                          ...(col.width ? { width: col.width } : {}),
                          ...(col.maxWidth ? { maxWidth: col.maxWidth } : {}),
                        }}
                      >
                        {col.render(item, index)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {hasMore && (
              <Box ref={sentinelRef} py="md">
                {loadingMore && (
                  <Center>
                    <Loader size="sm" />
                  </Center>
                )}
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
