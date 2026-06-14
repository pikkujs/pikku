import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { Zap } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider, usePanelContext } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

interface TriggerPair {
  name: string
  source: any | null
  trigger: any | null
}

const TriggersTable: React.FC<{
  pairs: TriggerPair[]
  loading?: boolean
}> = ({ pairs, loading }) => {
  const { openTriggerSource, openTrigger } = usePanelContext()
  const { t } = useI18n()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (pair: TriggerPair) => <Text fw={500}>{asI18n(pair.name)}</Text>,
      },
      {
        key: 'source',
        header: 'SOURCE',
        render: (pair: TriggerPair) => (
          <PikkuBadge
            type="label"
            size="sm"
            variant={pair.source ? 'light' : 'outline'}
            color={pair.source ? 'grape' : 'red'}
            style={{ cursor: pair.source ? 'pointer' : 'default' }}
            onClick={(e: React.MouseEvent) => {
              if (pair.source) {
                e.stopPropagation()
                openTriggerSource(pair.name, pair.source)
              }
            }}
          >
            {asI18n(pair.source ? pair.source.pikkuFuncId || 'Source' : 'Missing')}
          </PikkuBadge>
        ),
      },
      {
        key: 'trigger',
        header: 'TRIGGER',
        align: 'right' as const,
        render: (pair: TriggerPair) => (
          <PikkuBadge
            type="label"
            size="sm"
            variant={pair.trigger ? 'light' : 'outline'}
            color={pair.trigger ? 'yellow' : 'red'}
            style={{ cursor: pair.trigger ? 'pointer' : 'default' }}
            onClick={(e: React.MouseEvent) => {
              if (pair.trigger) {
                e.stopPropagation()
                openTrigger(pair.name, pair.trigger)
              }
            }}
          >
            {asI18n(pair.trigger ? pair.trigger.pikkuFuncId || 'Trigger' : 'Missing')}
          </PikkuBadge>
        ),
      },
    ],
    [openTriggerSource, openTrigger]
  )

  return (
    <TableListPage
      title="Triggers"
      icon={Zap}
      docsHref="https://pikku.dev/docs/wiring/triggers"
      data={pairs}
      columns={columns}
      getKey={(pair) => pair.name}
      onRowClick={(pair) => {
        if (pair.source) openTriggerSource(pair.name, pair.source)
        else if (pair.trigger) openTrigger(pair.name, pair.trigger)
      }}
      searchPlaceholder={t('triggers.search_placeholder')}
      searchFilter={(pair, q) =>
        pair.name.toLowerCase().includes(q) ||
        pair.source?.pikkuFuncId?.toLowerCase().includes(q) ||
        pair.trigger?.pikkuFuncId?.toLowerCase().includes(q)
      }
      emptyMessage={t('triggers.empty_message')}
      loading={loading}
    />
  )
}

export const TriggersPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  const { t } = useI18n()

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

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={<ListPageHeader title={t('triggers.title')} description={t('triggers.description')} />}
        hidePanel={!loading && pairs.length === 0}
        emptyPanelMessage={t('triggers.select_item')}
      >
        <TriggersTable pairs={pairs} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
