import React, { useState, useMemo } from 'react'
import {
  Stack,
  Text,
  ScrollArea,
  Badge,
  SegmentedControl,
  Box,
  Loader,
  Group,
  ActionIcon,
  Button,
} from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Check, Plus, X } from 'lucide-react'
import classes from '../ui/console.module.css'

const statusColors: Record<string, string> = {
  running: 'blue',
  completed: 'green',
  failed: 'red',
  cancelled: 'gray',
}

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

export interface RunItem {
  id: string
  status: string
  createdAt: string
  label?: string
  wire?: { type: string; id?: string }
}

interface RunsPanelProps {
  runs: RunItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
  loading?: boolean
  statusFilters?: string[]
  title: string
  emptyMessage?: I18nNode
  onNewClick?: () => void
  newButtonLabel?: I18nNode
  onStatusFilterChange?: (status: string | undefined) => void
  onDelete?: (id: string) => void
  header?: React.ReactNode
}

const RunRow: React.FC<{
  run: RunItem
  selected: boolean
  onSelect: () => void
  onDelete?: (id: string) => void
}> = ({ run, selected, onSelect, onDelete }) => {
  const [confirming, setConfirming] = useState(false)
  const [hovered, setHovered] = useState(false)
  useLocale()

  if (confirming) {
    return (
      <Box
        py="sm"
        px="sm"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          backgroundColor: 'var(--mantine-color-red-light)',
        }}
      >
        <Text size="sm" fw={500} mb={6}>
          {m.runs_panel_delete_confirm()}
        </Text>
        <Group gap="xs">
          <Button
            size="compact-xs"
            color="red"
            leftSection={<Check size={12} />}
            onClick={() => {
              onDelete?.(run.id)
              setConfirming(false)
            }}
          >
            {m.common_yes()}
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<X size={12} />}
            onClick={() => setConfirming(false)}
          >
            {m.common_no()}
          </Button>
        </Group>
      </Box>
    )
  }

  return (
    <Box
      py="sm"
      px="sm"
      style={{
        backgroundColor: selected
          ? 'var(--mantine-color-blue-light)'
          : undefined,
        borderBottom: '1px solid var(--mantine-color-default-border)',
        cursor: 'pointer',
      }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Group gap="xs" justify="space-between" wrap="nowrap" align="center">
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Badge
              size="sm"
              color={statusColors[run.status] || 'gray'}
              variant="filled"
              circle
            >
              {asI18n(' ')}
            </Badge>
            <Text size="sm" ff="monospace" truncate>
              {asI18n(run.label || run.id.slice(0, 8))}
            </Text>
            {run.wire && (
              <Badge size="sm" variant="light" color="gray">
                {asI18n(run.wire.type)}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed" pl={18}>
            {asI18n(formatDateTime(run.createdAt))}
          </Text>
        </Stack>
        {onDelete && hovered && (
          <ActionIcon
            variant="subtle"
            size="md"
            color="gray"
            onClick={(e) => {
              e.stopPropagation()
              setConfirming(true)
            }}
            title={m.runs_panel_delete_run()}
          >
            <X size={16} />
          </ActionIcon>
        )}
      </Group>
    </Box>
  )
}

export const RunsPanel: React.FC<RunsPanelProps> = ({
  runs,
  selectedId,
  onSelect,
  onClear,
  loading = false,
  statusFilters = ['running', 'completed', 'failed'],
  title,
  emptyMessage,
  onNewClick,
  newButtonLabel,
  onStatusFilterChange,
  onDelete,
  header,
}) => {
  const [statusFilter, setStatusFilter] = useState('all')
  useLocale()

  const filteredRuns = useMemo(() => {
    if (statusFilter === 'all') return runs
    return runs.filter((r) => r.status === statusFilter)
  }, [runs, statusFilter])

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    onStatusFilterChange?.(value === 'all' ? undefined : value)
  }

  const segmentData = [
    { value: 'all', label: m.runs_panel_filter_all() },
    ...statusFilters.map((s) => ({
      value: s,
      label: asI18n(s.charAt(0).toUpperCase() + s.slice(1)),
    })),
  ]

  return (
    <Stack gap={0} className={classes.flexColumn}>
      {header}
      {statusFilters.length > 0 && (
        <Box
          px="sm"
          py="xs"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <SegmentedControl
            size="sm"
            fullWidth
            value={statusFilter}
            onChange={handleStatusChange}
            data={segmentData}
          />
        </Box>
      )}

      <ScrollArea className={classes.flexGrow}>
        {onNewClick && (
          <Box
            py="sm"
            px="sm"
            style={{
              borderBottom: '1px solid var(--mantine-color-default-border)',
              cursor: 'pointer',
            }}
            onClick={onNewClick}
          >
            <Group gap="xs">
              <Plus size={16} color="var(--mantine-color-primary-6)" />
              <Text size="sm" fw={500} c="primary">
                {newButtonLabel ?? m.runs_panel_new()}
              </Text>
            </Group>
          </Box>
        )}
        {loading ? (
          <Box p="md" ta="center">
            <Loader size="sm" />
          </Box>
        ) : filteredRuns.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            {emptyMessage ?? m.runs_panel_empty()}
          </Text>
        ) : (
          <Stack gap={0}>
            {filteredRuns.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                selected={run.id === selectedId}
                onSelect={() => onSelect(run.id)}
                onDelete={onDelete}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>
    </Stack>
  )
}
