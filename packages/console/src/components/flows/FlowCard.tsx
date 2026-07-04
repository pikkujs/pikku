import React, { useMemo, useState } from 'react'
import { Box, Group, Stack, Text, Badge } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Route, Check, X, Loader } from 'lucide-react'
import { FlowCast } from './FlowCast'
import { useWorkflowRuns } from '../../hooks/useWorkflowRuns'
import type { FlowEntry } from './flow-types'

const relativeTime = (iso?: string): string => {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const min = Math.round((Date.now() - then) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

const STATUS_META: Record<
  string,
  { tone: string; label: string; Icon: typeof Check }
> = {
  completed: { tone: 'green', label: 'passed', Icon: Check },
  failed: { tone: 'red', label: 'failed', Icon: X },
  cancelled: { tone: 'red', label: 'cancelled', Icon: X },
  running: { tone: 'blue', label: 'running', Icon: Loader },
}

type FlowCardProps = {
  flow: FlowEntry
  onOpen: (name: string) => void
}

export const FlowCard: React.FC<FlowCardProps> = ({ flow, onOpen }) => {
  const [hovered, setHovered] = useState(false)
  const { data: runs } = useWorkflowRuns(flow.name)

  const { lastRun, count } = useMemo(() => {
    const list = (runs as { status: string; startedAt?: string }[]) ?? []
    const sorted = [...list].sort(
      (a, b) =>
        new Date(b.startedAt ?? 0).getTime() -
        new Date(a.startedAt ?? 0).getTime()
    )
    return { lastRun: sorted[0], count: list.length }
  }, [runs])

  const status = lastRun ? STATUS_META[lastRun.status] : undefined

  return (
    <Box
      data-testid={`flow-card-${flow.name}`}
      onClick={() => onOpen(flow.name)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? 'var(--mantine-color-default-hover)'
          : 'var(--app-surface, var(--mantine-color-body))',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 14,
        cursor: 'pointer',
        transition: 'background 100ms',
        padding: '18px 22px',
      }}
    >
      <Group gap={18} wrap="nowrap" align="center">
        <Box
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--mantine-color-cyan-light)',
            color: 'var(--mantine-color-cyan-light-color)',
          }}
        >
          <Route size={22} strokeWidth={1.8} />
        </Box>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text size="md" fw={600} style={{ lineHeight: 1.2 }}>
            {asI18n(flow.displayName)}
          </Text>
          {flow.description && (
            <Text size="sm" c="dimmed" lineClamp={2}>
              {asI18n(flow.description)}
            </Text>
          )}
        </Stack>
        {flow.cast.length > 0 && <FlowCast cast={flow.cast} />}
        <Stack gap={6} align="flex-end" style={{ flexShrink: 0, minWidth: 92 }}>
          {status && (
            <Badge
              variant="light"
              color={status.tone}
              radius="xl"
              tt="none"
              fw={500}
              leftSection={<status.Icon size={11} strokeWidth={2.4} />}
            >
              {asI18n(`${status.label} · ${relativeTime(lastRun?.startedAt)}`)}
            </Badge>
          )}
          {count > 0 ? (
            <Text size="xs" ff="monospace" c="dimmed">
              {asI18n(`${count} ${count === 1 ? 'run' : 'runs'}`)}
            </Text>
          ) : (
            <Text size="xs" ff="monospace" c="dimmed">
              {asI18n(`${flow.stepCount} ${flow.stepCount === 1 ? 'step' : 'steps'}`)}
            </Text>
          )}
        </Stack>
      </Group>
    </Box>
  )
}
