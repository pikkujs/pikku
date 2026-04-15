import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  ScrollArea,
  Group,
  Badge,
} from '@mantine/core'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { useFunctionMeta } from '../../hooks/useWirings'
import { MetaRow } from '../ui/MetaRow'
import { SectionLabel } from '../ui/SectionLabel'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import { GridHeader } from '../ui/GridHeader'
import { ListItem } from '../ui/ListItem'
import { SearchInput } from '../ui/SearchInput'
import { DetailHeader } from '../ui/DetailHeader'
import { TagBadge } from '../ui/TagBadge'
import classes from '../ui/console.module.css'

const GRID_COLUMNS = '1fr 200px'

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
    <Box className={classes.flexColumn} style={{ overflow: 'auto' }}>
      <DetailHeader
        title={item.wireId || item.name}
        badge={{ label: 'Scheduler', color: 'yellow' }}
      />
      <Box p="md" className={classes.flexGrow}>
        <SectionLabel>Schedule</SectionLabel>
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
                navigateInPanel('function', funcId, displayName || funcId, funcMeta)
              }
            >
              {displayName}
            </Text>
          </MetaRow>
        )}
        <MetaRow label="timezone" labelWidth={80}>
          <Text size="xs" ff="monospace" c="var(--app-text)">
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
                    background: i === 0 ? 'rgba(6,182,212,0.04)' : 'var(--app-surface)',
                    border: i === 0
                      ? '1px solid rgba(6,182,212,0.22)'
                      : '1px solid var(--app-row-border)',
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

  const list = (
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search scheduled tasks..."
      />
      <GridHeader
        columns={[{ label: 'Name' }, { label: 'Schedule' }]}
        gridTemplateColumns={GRID_COLUMNS}
      />
      <ScrollArea className={classes.flexGrow}>
        {filtered.map((item: any) => {
          const isActive = selected === item.name
          return (
            <ListItem
              key={item.name}
              active={isActive}
              onClick={() => setSelected(item.name)}
              gridTemplateColumns={GRID_COLUMNS}
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
            </ListItem>
          )
        })}
      </ScrollArea>
    </>
  )

  return (
    <ListDetailLayout
      list={list}
      detail={selectedItem ? <SchedulerDetail item={selectedItem} /> : null}
      hasSelection={!!selectedItem}
      emptyMessage="Select a scheduled task"
    />
  )
}
