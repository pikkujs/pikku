import React, { useMemo } from 'react'
import { Text, Badge } from '@pikku/mantine/core'
import { Zap } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

interface TriggerPair {
  name: string
  source: any | null
  trigger: any | null
}

const columns = [
  {
    key: 'name',
    header: 'NAME',
    render: (item: TriggerPair) => (
      <Text fw={500} ff="monospace" truncate>
        {asI18n(item.name)}
      </Text>
    ),
  },
  {
    key: 'source',
    header: 'SOURCE',
    render: (item: TriggerPair) => (
      <Badge
        size="sm"
        ff="monospace"
        tt="none"
        style={{
          background: 'rgba(124,58,237,0.08)',
          border: '0.5px solid rgba(124,58,237,0.18)',
          color: '#a78bfa',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.source?.pikkuFuncId || 'Missing'}
      </Badge>
    ),
  },
  {
    key: 'target',
    header: 'TARGET',
    render: (item: TriggerPair) => (
      <Badge
        size="sm"
        ff="monospace"
        tt="none"
        style={{
          background: 'rgba(6,182,212,0.07)',
          border: '0.5px solid rgba(6,182,212,0.15)',
          color: '#06b6d4',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.trigger?.pikkuFuncId || 'Missing'}
      </Badge>
    ),
  },
]

export const TriggersTab: React.FC<{
  searchQuery: string
  emptyHero?: React.ReactNode
}> = ({ searchQuery, emptyHero }) => {
  const { meta } = usePikkuMeta()
  useLocale()
  const { openTrigger } = usePanelContext()

  const allPairs = useMemo((): TriggerPair[] => {
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

  const pairs = useMemo(() => {
    if (!searchQuery) return allPairs
    const q = searchQuery.toLowerCase()
    return allPairs.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.source?.pikkuFuncId?.toLowerCase().includes(q) ||
        p.trigger?.pikkuFuncId?.toLowerCase().includes(q)
    )
  }, [allPairs, searchQuery])

  return (
    <TableListPage
      title="Triggers"
      icon={Zap}
      docsHref="https://pikku.dev/docs/wiring/triggers"
      data={pairs}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openTrigger(item.name, item.trigger)}
      emptyMessage={m.triggers_empty_message()}
      emptyHero={emptyHero}
    />
  )
}
