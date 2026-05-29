import React, { useMemo, useState } from 'react'
import { Box, Text, ScrollArea } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { useFunctionMeta } from '../../hooks/useWirings'
import { MetaRow } from '../ui/MetaRow'
import { SectionLabel } from '../ui/SectionLabel'
import { ValText } from '../ui/ValText'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import { GridHeader } from '../ui/GridHeader'
import { ListItem } from '../ui/ListItem'
import { SearchInput } from '../ui/SearchInput'
import { DetailHeader } from '../ui/DetailHeader'
import classes from '../ui/console.module.css'

type QueueDepths = Record<
  string,
  { queued: number; active: number; failed: number }
>

const GRID_COLUMNS = '1fr 70px 70px 70px'

const QueueDetail: React.FC<{ item: any }> = ({ item }) => {
  const { navigateInPanel } = usePanelContext()
  const funcId = item?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const displayName = funcMeta?.name || funcId
  const config = item?.workerConfig || {}

  return (
    <Box className={classes.flexColumn} style={{ overflow: 'auto' }}>
      <DetailHeader
        title={item.wireId || item.name}
        badge={{ label: 'Queue', color: 'cyan' }}
      />
      <Box p="md" className={classes.flexGrow}>
        <SectionLabel>Handler</SectionLabel>
        {funcId && (
          <MetaRow label="function" labelWidth={130}>
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
        <MetaRow label="name" labelWidth={130}>
          <ValText value={item.wireId || item.name} />
        </MetaRow>
        <MetaRow label="autorun" labelWidth={130}>
          <ValText value={config.autorun ?? true} isBoolean />
        </MetaRow>

        <SectionLabel>Processing</SectionLabel>
        <MetaRow label="batchSize" labelWidth={130}>
          <ValText value={config.batchSize} />
        </MetaRow>
        <MetaRow label="prefetch" labelWidth={130}>
          <ValText value={config.prefetch} />
        </MetaRow>
        <MetaRow label="pollInterval" labelWidth={130}>
          <ValText value={config.pollInterval} />
        </MetaRow>

        <SectionLabel>Timeouts</SectionLabel>
        <MetaRow label="visibilityTimeout" labelWidth={130}>
          <ValText
            value={
              config.visibilityTimeout ? `${config.visibilityTimeout}s` : null
            }
          />
        </MetaRow>
        <MetaRow label="lockDuration" labelWidth={130}>
          <ValText
            value={config.lockDuration ? `${config.lockDuration}ms` : null}
          />
        </MetaRow>
        <MetaRow label="drainDelay" labelWidth={130}>
          <ValText value={config.drainDelay ? `${config.drainDelay}s` : null} />
        </MetaRow>
        <MetaRow label="maxStalledCount" labelWidth={130}>
          <ValText value={config.maxStalledCount} />
        </MetaRow>

        <SectionLabel>Retention</SectionLabel>
        <MetaRow label="removeOnComplete" labelWidth={130}>
          <ValText value={config.removeOnComplete} />
        </MetaRow>
        <MetaRow label="removeOnFail" labelWidth={130}>
          <ValText value={config.removeOnFail} />
        </MetaRow>
      </Box>
    </Box>
  )
}

export const QueuesTab: React.FC = () => {
  const { meta } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: depths } = useQuery<QueueDepths>({
    queryKey: ['console:getQueueDepths'],
    queryFn: () =>
      (rpc.invoke as (name: string) => Promise<unknown>)(
        'console:getQueueDepths'
      ).then((r) => (r ?? {}) as QueueDepths),
    refetchInterval: 5000,
  })

  const items = useMemo(() => {
    if (!meta.queueMeta) return []
    return Object.entries(meta.queueMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        ...data,
      })
    )
  }, [meta.queueMeta])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (item: any) =>
        item.name?.toLowerCase().includes(q) ||
        item.wireId?.toLowerCase().includes(q) ||
        item.pikkuFuncId?.toLowerCase().includes(q)
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
        placeholder="Search queue workers..."
      />
      <GridHeader
        columns={[
          { label: 'Name' },
          { label: 'Queued' },
          { label: 'Active' },
          { label: 'Failed' },
        ]}
        gridTemplateColumns={GRID_COLUMNS}
      />
      <ScrollArea className={classes.flexGrow}>
        {filtered.map((item: any) => {
          const isActive = selected === item.name
          const queueName = item.wireId || item.name
          const depth = depths?.[queueName]
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
                  truncate
                >
                  {queueName}
                </Text>
                <Text
                  size="sm"
                  ff="monospace"
                  c="var(--app-text-muted)"
                  truncate
                  style={{ fontSize: 9 }}
                >
                  {item.pikkuFuncId}
                </Text>
              </Box>
              <Text
                size="sm"
                ff="monospace"
                c={
                  depth?.queued
                    ? 'var(--app-meta-value)'
                    : 'var(--app-meta-label)'
                }
              >
                {depth?.queued ?? '—'}
              </Text>
              <Text
                size="sm"
                ff="monospace"
                c={
                  depth?.active
                    ? 'var(--mantine-color-green-5)'
                    : 'var(--app-meta-label)'
                }
              >
                {depth?.active ?? '—'}
              </Text>
              <Text
                size="sm"
                ff="monospace"
                c={
                  depth?.failed
                    ? 'var(--mantine-color-red-5)'
                    : 'var(--app-meta-label)'
                }
              >
                {depth?.failed ?? '—'}
              </Text>
            </ListItem>
          )
        })}
      </ScrollArea>
    </>
  )

  return (
    <ListDetailLayout
      list={list}
      detail={selectedItem ? <QueueDetail item={selectedItem} /> : null}
      hasSelection={!!selectedItem}
      emptyMessage="Select a queue worker"
    />
  )
}
