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
      style={{ minWidth: 130, flexShrink: 0, fontSize: 10 }}
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

const ValText: React.FunctionComponent<{
  value: any
  fallback?: string
  isBoolean?: boolean
}> = ({ value, fallback = '—', isBoolean }) => {
  const display = value != null && value !== '' ? String(value) : fallback
  const isDim = display === fallback

  if (isBoolean && !isDim) {
    return (
      <Text size="xs" ff="monospace" c={value ? '#86efac' : 'var(--app-text-muted)'}>
        {String(value)}
      </Text>
    )
  }

  return (
    <Text size="xs" ff="monospace" c={isDim ? 'var(--app-text-muted)' : 'var(--app-text)'}>
      {display}
    </Text>
  )
}

const QueueDetail: React.FunctionComponent<{ item: any }> = ({ item }) => {
  const { navigateInPanel } = usePanelContext()
  const funcId = item?.pikkuFuncId
  const { data: funcMeta } = useFunctionMeta(funcId ?? '')
  const displayName = funcMeta?.name || funcId
  const config = item?.workerConfig || {}

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <Box
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--app-row-border)',
          flexShrink: 0,
        }}
      >
        <Text
          size="sm"
          fw={600}
          ff="monospace"
          c="var(--app-meta-value)"
          mb={4}
          truncate
        >
          {item.wireId || item.name}
        </Text>
        <Badge size="sm" variant="light" color="cyan">
          Queue
        </Badge>
      </Box>
      <Box p="md" style={{ flex: 1 }}>
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
        <MetaRow label="name">
          <ValText value={item.wireId || item.name} />
        </MetaRow>
        <MetaRow label="autorun">
          <ValText value={config.autorun ?? true} isBoolean />
        </MetaRow>

        <SLabel>Processing</SLabel>
        <MetaRow label="batchSize">
          <ValText value={config.batchSize} />
        </MetaRow>
        <MetaRow label="prefetch">
          <ValText value={config.prefetch} />
        </MetaRow>
        <MetaRow label="pollInterval">
          <ValText value={config.pollInterval} />
        </MetaRow>

        <SLabel>Timeouts</SLabel>
        <MetaRow label="visibilityTimeout">
          <ValText value={config.visibilityTimeout ? `${config.visibilityTimeout}s` : null} />
        </MetaRow>
        <MetaRow label="lockDuration">
          <ValText value={config.lockDuration ? `${config.lockDuration}ms` : null} />
        </MetaRow>
        <MetaRow label="drainDelay">
          <ValText value={config.drainDelay ? `${config.drainDelay}s` : null} />
        </MetaRow>
        <MetaRow label="maxStalledCount">
          <ValText value={config.maxStalledCount} />
        </MetaRow>

        <SLabel>Retention</SLabel>
        <MetaRow label="removeOnComplete">
          <ValText value={config.removeOnComplete} />
        </MetaRow>
        <MetaRow label="removeOnFail">
          <ValText value={config.removeOnFail} />
        </MetaRow>
      </Box>
    </Box>
  )
}

export const QueuesTab: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta()
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const items = useMemo(() => {
    if (!meta.queueMeta) return []
    return Object.entries(meta.queueMeta).map(([name, data]: [string, any]) => ({
      name,
      ...data,
    }))
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
            placeholder="Search queue workers..."
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
          />
        </Box>
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px',
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
            Batch size
          </Text>
        </Box>
        <ScrollArea style={{ flex: 1 }}>
          {filtered.map((item: any) => {
            const isActive = selected === item.name
            const batchSize = item.workerConfig?.batchSize
            return (
              <UnstyledButton
                key={item.name}
                onClick={() => setSelected(item.name)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px',
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
                  <Text size="xs" ff="monospace" c={isActive ? 'var(--app-meta-value)' : 'var(--app-text)'} truncate>
                    {item.wireId || item.name}
                  </Text>
                  <Text size="xs" ff="monospace" c="var(--app-text-muted)" truncate style={{ fontSize: 9 }}>
                    {item.pikkuFuncId}
                  </Text>
                </Box>
                <Text size="xs" ff="monospace" c="var(--app-meta-label)">
                  {batchSize ?? '—'}
                </Text>
              </UnstyledButton>
            )
          })}
        </ScrollArea>
      </Box>

      {/* Detail */}
      <Box style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {selectedItem ? (
          <QueueDetail item={selectedItem} />
        ) : (
          <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Text c="dimmed" ff="monospace" size="sm">
              Select a queue worker
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
