import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  TextInput,
  ScrollArea,
  UnstyledButton,
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
      alignItems: 'flex-start',
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
      style={{ minWidth: 70, flexShrink: 0, fontSize: 10, paddingTop: 2 }}
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

interface TriggerPair {
  name: string
  source: any | null
  trigger: any | null
}

const TriggerDetail: React.FunctionComponent<{ item: TriggerPair }> = ({
  item,
}) => {
  const { navigateInPanel } = usePanelContext()
  const sourceFuncId = item.source?.pikkuFuncId
  const targetFuncId = item.trigger?.pikkuFuncId
  const { data: sourceMeta } = useFunctionMeta(sourceFuncId ?? '')
  const { data: targetMeta } = useFunctionMeta(targetFuncId ?? '')
  const sourceDisplayName = sourceMeta?.name || sourceFuncId
  const targetDisplayName = targetMeta?.name || targetFuncId

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
      }}
    >
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
        >
          {item.name}
        </Text>
        <Badge
          size="sm"
          variant="light"
          color="violet"
        >
          Trigger
        </Badge>
      </Box>
      <Box p="md" style={{ flex: 1 }}>
        {item.source && (
          <>
            <SLabel>Source</SLabel>
            <MetaRow label="function">
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  navigateInPanel(
                    'function',
                    sourceFuncId,
                    sourceDisplayName || sourceFuncId,
                    sourceMeta
                  )
                }
              >
                {sourceDisplayName}
              </Text>
            </MetaRow>
          </>
        )}

        {item.trigger && (
          <>
            <SLabel>Target</SLabel>
            <MetaRow label="function">
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  navigateInPanel(
                    'function',
                    targetFuncId,
                    targetDisplayName || targetFuncId,
                    targetMeta
                  )
                }
              >
                {targetDisplayName}
              </Text>
            </MetaRow>
          </>
        )}
      </Box>
    </Box>
  )
}

export const TriggersTab: React.FunctionComponent = () => {
  const { meta } = usePikkuMeta()
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const pairs = useMemo((): TriggerPair[] => {
    const names = new Set<string>()
    if (meta.triggerSourceMeta)
      Object.keys(meta.triggerSourceMeta).forEach((n) => names.add(n))
    if (meta.triggerMeta)
      Object.keys(meta.triggerMeta).forEach((n) => names.add(n))
    return Array.from(names)
      .sort()
      .map((name) => ({
        name,
        source: meta.triggerSourceMeta?.[name] || null,
        trigger: meta.triggerMeta?.[name] || null,
      }))
  }, [meta.triggerMeta, meta.triggerSourceMeta])

  const filtered = useMemo(() => {
    if (!search) return pairs
    const q = search.toLowerCase()
    return pairs.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.source?.pikkuFuncId?.toLowerCase().includes(q) ||
        p.trigger?.pikkuFuncId?.toLowerCase().includes(q)
    )
  }, [pairs, search])

  const selectedItem = useMemo(() => {
    if (!selected) return null
    return pairs.find((p) => p.name === selected) || null
  }, [pairs, selected])

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
            placeholder="Search triggers..."
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="xs"
          />
        </Box>
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            padding: '7px 16px',
            borderBottom: '1px solid var(--app-row-border)',
            background: '#0a0c12',
            flexShrink: 0,
          }}
        >
          <Text
            size="xs"
            fw={600}
            ff="monospace"
            c="var(--app-section-label)"
            tt="uppercase"
            style={{ letterSpacing: '0.1em', fontSize: 9 }}
          >
            Name
          </Text>
          <Text
            size="xs"
            fw={600}
            ff="monospace"
            c="var(--app-section-label)"
            tt="uppercase"
            style={{ letterSpacing: '0.1em', fontSize: 9 }}
          >
            Source
          </Text>
          <Text
            size="xs"
            fw={600}
            ff="monospace"
            c="var(--app-section-label)"
            tt="uppercase"
            style={{ letterSpacing: '0.1em', fontSize: 9 }}
          >
            Target
          </Text>
        </Box>
        <ScrollArea style={{ flex: 1 }}>
          {filtered.map((pair) => {
            const isActive = selected === pair.name
            return (
              <UnstyledButton
                key={pair.name}
                onClick={() => setSelected(pair.name)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: isActive
                    ? '2px solid #7c3aed'
                    : '2px solid transparent',
                  background: isActive
                    ? 'rgba(124,58,237,0.05)'
                    : undefined,
                  width: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  alignItems: 'center',
                }}
              >
                <Text
                  size="xs"
                  ff="monospace"
                  c={
                    isActive ? 'var(--app-meta-value)' : 'var(--app-text)'
                  }
                >
                  {pair.name}
                </Text>
                <Badge
                  size="xs"
                  ff="monospace"
                  tt="none"
                  style={{
                    background: 'rgba(124,58,237,0.08)',
                    border: '0.5px solid rgba(124,58,237,0.18)',
                    color: '#a78bfa',
                    maxWidth: 150,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {pair.source?.pikkuFuncId || 'Missing'}
                </Badge>
                <Badge
                  size="xs"
                  ff="monospace"
                  tt="none"
                  style={{
                    background: 'rgba(6,182,212,0.07)',
                    border: '0.5px solid rgba(6,182,212,0.15)',
                    color: '#06b6d4',
                    maxWidth: 150,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {pair.trigger?.pikkuFuncId || 'Missing'}
                </Badge>
              </UnstyledButton>
            )
          })}
        </ScrollArea>
      </Box>

      {/* Detail */}
      <Box style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {selectedItem ? (
          <TriggerDetail item={selectedItem} />
        ) : (
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Text c="dimmed" ff="monospace" size="sm">
              Select a trigger
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
