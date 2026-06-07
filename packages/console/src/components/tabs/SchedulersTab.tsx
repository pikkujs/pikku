import React, { useMemo, useState } from 'react'
import { Box, Text, ScrollArea, Group, Badge } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useFunctionMeta } from '../../hooks/useWirings'
import { MetaRow } from '../ui/MetaRow'
import { SectionLabel } from '../ui/SectionLabel'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import { GridHeader } from '../ui/GridHeader'
import { ListItem } from '../ui/ListItem'
import { SearchInput } from '../ui/SearchInput'
import { DetailHeader } from '../ui/DetailHeader'
import { TagBadge } from '../ui/TagBadge'
import { EmptyState } from '../ui/EmptyState'
import classes from '../ui/console.module.css'

type RunEntry = {
  timestamp: number
  status: 'completed' | 'failed'
  durationSeconds: number | null
  error: string | null
}
type SchedulerHistory = Record<
  string,
  { lastRun: RunEntry | null; history: RunEntry[] }
>

const GRID_COLUMNS = '1fr 160px 120px'

const CronBadges: React.FC<{ schedule: string }> = ({ schedule }) => {
  const parts = schedule.split(' ')
  return (
    <Group gap={3} wrap="nowrap">
      {parts.map((part, i) => (
        <Badge
          key={i}
          size="sm"
          ff="monospace"
          tt="none"
          style={{
            background: 'rgba(245,158,11,0.08)',
            border: '0.5px solid rgba(245,158,11,0.18)',
            color: '#fbbf24',
            padding: '1px 5px',
          }}
        >
          {part}
        </Badge>
      ))}
    </Group>
  )
}

const cronToHuman = (cron: string): string => {
  const [min, hr, dom, mon, dow] = cron.split(' ')
  const parts: string[] = []

  if (dow !== '*' && dom === '*') {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]
    parts.push(`Every ${days[parseInt(dow)] || dow}`)
  } else if (dom !== '*') {
    parts.push(`Day ${dom} of every month`)
  } else {
    parts.push('Every day')
  }

  parts.push(`at ${hr}:${min?.padStart(2, '0')}`)
  return parts.join(' ')
}

const parseCronField = (
  field: string | undefined,
  fallback: number
): number => {
  if (!field || field === '*') return fallback
  const n = parseInt(field)
  return isNaN(n) ? fallback : n
}

const getNextRuns = (cron: string, count: number): Date[] => {
  const [min, hr, dom, , dow] = cron.split(' ')
  const runs: Date[] = []
  const now = new Date()
  const d = new Date(now)
  d.setSeconds(0)
  d.setMilliseconds(0)
  d.setMinutes(parseCronField(min, now.getMinutes()))
  d.setHours(parseCronField(hr, now.getHours()))
  if (d <= now) d.setDate(d.getDate() + 1)
  let attempts = 0
  while (runs.length < count && attempts < 500) {
    attempts++
    let ok = true
    if (dow && dow !== '*' && !dow.split(',').map(Number).includes(d.getDay()))
      ok = false
    if (dom && dom !== '*' && d.getDate() !== parseInt(dom)) ok = false
    if (ok) runs.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return runs
}

const fmtRelative = (ts: number): string => {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const fmtDuration = (s: number | null): string => {
  if (s === null) return ''
  if (s < 1) return `${Math.round(s * 1000)}ms`
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

const fmtDate = (d: Date): string => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`
}

const fmtTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const SchedulerDetail: React.FC<{ item: any; history: SchedulerHistory }> = ({
  item,
  history,
}) => {
  const { navigateInPanel } = usePanelContext()
  const funcId = item?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const displayName = funcMeta?.name || funcId
  const schedule = item?.schedule || ''
  const nextRuns = useMemo(() => getNextRuns(schedule, 5), [schedule])
  const taskName = item?.wireId || item?.name
  const taskHistory = history[taskName]

  return (
    <Box className={classes.flexColumn} style={{ overflow: 'auto' }}>
      <DetailHeader
        title={item.wireId || item.name}
        badge={{ label: 'Scheduler', color: 'yellow' }}
      />
      <Box p="md" className={classes.flexGrow}>
        <SectionLabel>Schedule</SectionLabel>
        <Box
          style={{
            background: 'var(--app-code-bg)',
            border: '1px solid rgba(245,158,11,0.15)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            color: 'var(--app-amber, #fbbf24)',
            fontFamily: 'var(--mantine-font-family-monospace)',
            marginBottom: 4,
          }}
        >
          {cronToHuman(schedule)}
        </Box>
        <Text size="sm" ff="monospace" c="var(--app-text-muted)">
          cron: {schedule}
        </Text>

        <SectionLabel>Handler</SectionLabel>
        {funcId && (
          <MetaRow label="function" labelWidth={80}>
            <Text
              size="sm"
              fw={600}
              ff="monospace"
              c="var(--app-meta-value)"
              className={classes.clickableText}
              onClick={() =>
                navigateInPanel(
                  'function',
                  funcId,
                  displayName || funcId,
                  funcMeta
                )
              }
            >
              {displayName}
            </Text>
          </MetaRow>
        )}
        <MetaRow label="timezone" labelWidth={80}>
          <Text size="sm" ff="monospace" c="var(--app-text)">
            UTC
          </Text>
        </MetaRow>

        {item.tags && item.tags.length > 0 && (
          <MetaRow label="tags" labelWidth={80}>
            <Group gap={4}>
              {item.tags.map((tag: string, i: number) => (
                <TagBadge key={i}>{tag}</TagBadge>
              ))}
            </Group>
          </MetaRow>
        )}

        {taskHistory?.history && taskHistory.history.length > 0 && (
          <>
            <SectionLabel>Recent Runs</SectionLabel>
            <Box
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                marginBottom: 12,
              }}
            >
              {taskHistory.history.map((run, i) => (
                <Box
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 5,
                    background: 'var(--app-surface)',
                    border: `1px solid ${run.status === 'failed' ? 'rgba(239,68,68,0.2)' : 'var(--app-row-border)'}`,
                    gap: 8,
                  }}
                >
                  <Box style={{ minWidth: 0 }}>
                    <Text
                      size="xs"
                      ff="monospace"
                      c={
                        run.status === 'failed'
                          ? 'var(--mantine-color-red-5)'
                          : 'var(--mantine-color-green-5)'
                      }
                    >
                      {run.status}
                    </Text>
                    {run.error && (
                      <Text
                        size="xs"
                        ff="monospace"
                        c="var(--app-text-muted)"
                        style={{ wordBreak: 'break-word' }}
                      >
                        {run.error}
                      </Text>
                    )}
                  </Box>
                  <Box style={{ textAlign: 'right', flexShrink: 0 }}>
                    <Text size="xs" ff="monospace" c="var(--app-text)">
                      {fmtRelative(run.timestamp)}
                    </Text>
                    {run.durationSeconds !== null && (
                      <Text size="xs" ff="monospace" c="var(--app-text-muted)">
                        {fmtDuration(run.durationSeconds)}
                      </Text>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}

        {nextRuns.length > 0 && (
          <>
            <SectionLabel>Next Runs</SectionLabel>
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {nextRuns.map((run, i) => (
                <Box
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 5,
                    background:
                      i === 0 ? 'rgba(6,182,212,0.04)' : 'var(--app-surface)',
                    border:
                      i === 0
                        ? '1px solid rgba(6,182,212,0.22)'
                        : '1px solid var(--app-row-border)',
                  }}
                >
                  <Text size="sm" ff="monospace" c="var(--app-meta-label)">
                    {fmtDate(run)}
                  </Text>
                  <Group gap={6}>
                    <Text size="sm" ff="monospace" c="var(--app-text)">
                      {fmtTime(run)}
                    </Text>
                    {i === 0 && (
                      <Badge
                        size="sm"
                        ff="monospace"
                        tt="none"
                        style={{
                          background: 'rgba(6,182,212,0.08)',
                          color: '#06b6d4',
                          padding: '1px 5px',
                        }}
                      >
                        next
                      </Badge>
                    )}
                  </Group>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}

export const SchedulersTab: React.FC = () => {
  const { meta } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: history = {} } = useQuery<SchedulerHistory>({
    queryKey: ['console:getSchedulerHistory'],
    queryFn: () =>
      (rpc.invoke as (name: string) => Promise<unknown>)(
        'console:getSchedulerHistory'
      ).then((r) => (r ?? {}) as SchedulerHistory),
    refetchInterval: 15000,
  })

  const items = useMemo(() => {
    if (!meta.schedulerMeta) return []
    return Object.entries(meta.schedulerMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        ...data,
      })
    )
  }, [meta.schedulerMeta])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (item: any) =>
        item.name?.toLowerCase().includes(q) ||
        item.pikkuFuncId?.toLowerCase().includes(q) ||
        item.schedule?.toLowerCase().includes(q)
    )
  }, [items, search])

  const selectedItem = useMemo(() => {
    if (!selected) return null
    return items.find((i: any) => i.name === selected) || null
  }, [items, selected])

  const list = (
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search scheduled tasks..."
      />
      <GridHeader
        columns={[
          { label: 'Name' },
          { label: 'Schedule' },
          { label: 'Last Run' },
        ]}
        gridTemplateColumns={GRID_COLUMNS}
      />
      <ScrollArea className={classes.flexGrow}>
        {filtered.length === 0 && (
          <EmptyState
            title={
              items.length === 0
                ? 'No scheduled tasks defined'
                : 'No scheduled tasks match your search'
            }
          />
        )}
        {filtered.map((item: any) => {
          const isActive = selected === item.name
          const taskName = item.wireId || item.name
          const lastRun = history[taskName]?.lastRun ?? null
          return (
            <ListItem
              key={item.name}
              active={isActive}
              onClick={() => setSelected(item.name)}
              gridTemplateColumns={GRID_COLUMNS}
            >
              <Box>
                <Text
                  size="sm"
                  ff="monospace"
                  c={isActive ? 'var(--app-meta-value)' : 'var(--app-text)'}
                >
                  {taskName}
                </Text>
                <Text
                  size="sm"
                  ff="monospace"
                  c="var(--app-text-muted)"
                  style={{ fontSize: 9 }}
                >
                  {item.pikkuFuncId}()
                </Text>
              </Box>
              {item.schedule && <CronBadges schedule={item.schedule} />}
              <Box>
                {lastRun ? (
                  <>
                    <Text
                      size="xs"
                      ff="monospace"
                      c={
                        lastRun.status === 'failed'
                          ? 'var(--mantine-color-red-5)'
                          : 'var(--mantine-color-green-5)'
                      }
                    >
                      {lastRun.status}
                    </Text>
                    <Text size="xs" ff="monospace" c="var(--app-text-muted)">
                      {fmtRelative(lastRun.timestamp)}
                    </Text>
                  </>
                ) : (
                  <Text size="xs" ff="monospace" c="var(--app-meta-label)">
                    —
                  </Text>
                )}
              </Box>
            </ListItem>
          )
        })}
      </ScrollArea>
    </>
  )

  return (
    <ListDetailLayout
      list={list}
      detail={
        selectedItem ? (
          <SchedulerDetail item={selectedItem} history={history} />
        ) : null
      }
      hasSelection={!!selectedItem}
      emptyMessage="Select a scheduled task"
    />
  )
}
