import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  TextInput,
  ScrollArea,
  UnstyledButton,
  Group,
  Badge,
} from '@mantine/core'
import { Search } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { useFunctionMeta } from '../../hooks/useWirings'

const MetaRow: React.FunctionComponent<{
  label: string
  children: React.ReactNode
}> = ({ label, children }) => (
  <Box
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 0',
      borderBottom: '1px solid var(--app-row-border)',
      fontSize: 11,
    }}
  >
    <Text
      size="xs"
      ff="monospace"
      c="var(--app-meta-label)"
      style={{ minWidth: 80, flexShrink: 0 }}
    >
      {label}
    </Text>
    <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
  </Box>
)

const SLabel: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Text
    size="xs"
    fw={600}
    ff="monospace"
    c="var(--app-section-label)"
    tt="uppercase"
    style={{ letterSpacing: '0.1em', padding: '12px 0 6px' }}
  >
    {children}
  </Text>
)

const CronBadges: React.FunctionComponent<{ schedule: string }> = ({
  schedule,
}) => {
  const parts = schedule.split(' ')
  return (
    <Group gap={3} wrap="nowrap">
      {parts.map((part, i) => (
        <Badge
          key={i}
          size="xs"
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
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    parts.push(`Every ${days[parseInt(dow)] || dow}`)
  } else if (dom !== '*') {
    parts.push(`Day ${dom} of every month`)
  } else {
    parts.push('Every day')
  }

  parts.push(`at ${hr}:${min?.padStart(2, '0')}`)
  return parts.join(' ')
}

const getNextRuns = (cron: string, count: number): Date[] => {
  const [min, hr, dom, , dow] = cron.split(' ')
  const runs: Date[] = []
  const d = new Date()
  d.setSeconds(0)
  d.setMilliseconds(0)
  d.setMinutes(parseInt(min || '0'))
  d.setHours(parseInt(hr || '0'))
  if (d <= new Date()) d.setDate(d.getDate() + 1)
  let attempts = 0
  while (runs.length < count && attempts < 500) {
    attempts++
    let ok = true
    if (dow !== '*' && !dow!.split(',').map(Number).includes(d.getDay())) ok = false
    if (dom !== '*' && d.getDate() !== parseInt(dom || '1')) ok = false
    if (ok) runs.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return runs
}

const fmtDate = (d: Date): string => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`
}

const fmtTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const SchedulerDetail: React.FunctionComponent<{ item: any }> = ({ item }) => {
  const { navigateInPanel } = usePanelContext()
  const funcId = item?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const displayName = funcMeta?.name || funcId
  const schedule = item?.schedule || ''
  const nextRuns = useMemo(() => getNextRuns(schedule, 8), [schedule])

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <Box
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--app-row-border)',
          flexShrink: 0,
        }}
      >
        <Text size="sm" fw={600} ff="monospace" c="var(--app-meta-value)" mb={4}>
          {item.wireId || item.name}
        </Text>
        <Badge size="sm" variant="light" color="yellow">
          Scheduler
        </Badge>
      </Box>
      <Box p="md" style={{ flex: 1 }}>
        <SLabel>Schedule</SLabel>
        <Box
          style={{
            background: '#111827',
            border: '1px solid rgba(245,158,11,0.15)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            color: '#fbbf24',
            fontFamily: 'var(--mantine-font-family-monospace)',
            marginBottom: 4,
          }}
        >
          {cronToHuman(schedule)}
        </Box>
        <Text size="xs" ff="monospace" c="var(--app-text-muted)">
          cron: {schedule}
        </Text>

        <SLabel>Handler</SLabel>
        {funcId && (
          <MetaRow label="function">
            <Text
              size="sm"
              fw={600}
              ff="monospace"
              c="var(--app-meta-value)"
              style={{ cursor: 'pointer' }}
              onClick={() =>
                navigateInPanel('function', funcId, displayName || funcId, funcMeta)
              }
            >
              {displayName}
            </Text>
          </MetaRow>
        )}
        <MetaRow label="timezone">
          <Text size="xs" ff="monospace" c="var(--app-text)">
            UTC
          </Text>
        </MetaRow>

        {item.tags && item.tags.length > 0 && (
          <MetaRow label="tags">
            <Group gap={4}>
              {item.tags.map((tag: string, i: number) => (
                <Badge
                  key={i}
                  size="sm"
                  variant="light"
                  ff="monospace"
                  style={{
                    background: 'var(--app-tag-bg)',
                    border: '1px solid var(--app-tag-border)',
                    color: 'var(--app-tag-color)',
                  }}
                >
                  {tag}
                </Badge>
              ))}
            </Group>
          </MetaRow>
        )}

        {nextRuns.length > 0 && (
          <>
            <SLabel>Next Runs</SLabel>
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
                    background: 'var(--app-surface)',
                    border: i === 0
                      ? '1px solid rgba(6,182,212,0.22)'
                      : '1px solid var(--app-row-border)',
                    ...(i === 0 && { background: 'rgba(6,182,212,0.04)' }),
                  }}
                >
                  <Text size="xs" ff="monospace" c="var(--app-meta-label)">
                    {fmtDate(run)}
                  </Text>
                  <Group gap={6}>
                    <Text size="xs" ff="monospace" c="var(--app-text)">
                      {fmtTime(run)}
                    </Text>
                    {i === 0 && (
                      <Badge
                        size="xs"
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

export const SchedulersTab: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta()
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const items = useMemo(() => {
    if (!meta.schedulerMeta) return []
    return Object.entries(meta.schedulerMeta).map(([name, data]: [string, any]) => ({
      name,
      ...data,
    }))
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

  return (
    <Box style={{ display: 'flex', height: '100%' }}>
      {/* List */}
      <Box
        style={{
          flex: 1,
          borderRight: '1px solid var(--app-row-border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box p="xs">
          <TextInput
            placeholder="Search scheduled tasks..."
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
          />
        </Box>
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 200px',
            padding: '7px 16px',
            borderBottom: '1px solid var(--app-row-border)',
            background: '#0a0c12',
            flexShrink: 0,
          }}
        >
          <Text size="xs" fw={600} ff="monospace" c="var(--app-section-label)" tt="uppercase" style={{ letterSpacing: '0.1em', fontSize: 9 }}>
            Name
          </Text>
          <Text size="xs" fw={600} ff="monospace" c="var(--app-section-label)" tt="uppercase" style={{ letterSpacing: '0.1em', fontSize: 9 }}>
            Schedule
          </Text>
        </Box>
        <ScrollArea style={{ flex: 1 }}>
          {filtered.map((item: any) => {
            const isActive = selected === item.name
            return (
              <UnstyledButton
                key={item.name}
                onClick={() => setSelected(item.name)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 200px',
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                  background: isActive ? 'rgba(124,58,237,0.05)' : undefined,
                  width: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Text size="xs" ff="monospace" c={isActive ? 'var(--app-meta-value)' : 'var(--app-text)'}>
                    {item.wireId || item.name}
                  </Text>
                  <Text size="xs" ff="monospace" c="var(--app-text-muted)" style={{ fontSize: 9 }}>
                    {item.pikkuFuncId}()
                  </Text>
                </Box>
                {item.schedule && <CronBadges schedule={item.schedule} />}
              </UnstyledButton>
            )
          })}
        </ScrollArea>
      </Box>

      {/* Detail */}
      <Box style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {selectedItem ? (
          <SchedulerDetail item={selectedItem} />
        ) : (
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text c="dimmed" ff="monospace" size="sm">
              Select a scheduled task
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
