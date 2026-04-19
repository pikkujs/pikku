import React, { useMemo, useState } from 'react'
import {
  Box,
  Text,
  ScrollArea,
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
import classes from '../ui/console.module.css'

const GRID_COLUMNS = '1fr 1fr 1fr'

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
    <Box className={classes.flexColumn} style={{ overflow: 'auto' }}>
      <DetailHeader
        title={item.name}
        badge={{ label: 'Trigger', color: 'violet' }}
      />
      <Box p="md" className={classes.flexGrow}>
        {item.source && (
          <>
            <SectionLabel>Source</SectionLabel>
            <MetaRow label="function" labelWidth={70}>
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                className={classes.clickableText}
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
            <SectionLabel>Target</SectionLabel>
            <MetaRow label="function" labelWidth={70}>
              <Text
                size="sm"
                fw={600}
                ff="monospace"
                c="var(--app-meta-value)"
                className={classes.clickableText}
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

  const list = (
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search triggers..."
      />
      <GridHeader
        columns={[{ label: 'Name' }, { label: 'Source' }, { label: 'Target' }]}
        gridTemplateColumns={GRID_COLUMNS}
      />
      <ScrollArea className={classes.flexGrow}>
        {filtered.map((pair) => {
          const isActive = selected === pair.name
          return (
            <ListItem
              key={pair.name}
              active={isActive}
              onClick={() => setSelected(pair.name)}
              gridTemplateColumns={GRID_COLUMNS}
            >
              <Text
                size="xs"
                ff="monospace"
                c={isActive ? 'var(--app-meta-value)' : 'var(--app-text)'}
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
            </ListItem>
          )
        })}
      </ScrollArea>
    </>
  )

  return (
    <ListDetailLayout
      list={list}
      detail={selectedItem ? <TriggerDetail item={selectedItem} /> : null}
      hasSelection={!!selectedItem}
      emptyMessage="Select a trigger"
    />
  )
}
