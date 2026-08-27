import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Zap } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { useTriggerItems, type TriggerPair } from '../../hooks/useTriggerItems'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

export interface TriggersListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Every trigger in the project as selectable rows, each paired with its source.
 * Mount anywhere under a `ConsoleSurface` — it reads its own meta and opens the
 * source or trigger inspector.
 */
export const TriggersListPanel: React.FC<TriggersListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  const { openTriggerSource, openTrigger } = usePanelContext()
  useLocale()
  const { items: pairs, loading } = useTriggerItems()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (pair: TriggerPair) => (
          <Text fw={500}>{asI18n(pair.name)}</Text>
        ),
      },
      {
        key: 'source',
        header: 'Source',
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
            {asI18n(
              pair.source ? pair.source.pikkuFuncId || 'Source' : 'Missing'
            )}
          </PikkuBadge>
        ),
      },
      {
        key: 'trigger',
        header: 'Trigger',
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
            {asI18n(
              pair.trigger ? pair.trigger.pikkuFuncId || 'Trigger' : 'Missing'
            )}
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
      searchPlaceholder={m.triggers_search_placeholder()}
      externalSearch={externalSearch}
      searchFilter={(pair, q) =>
        pair.name.toLowerCase().includes(q) ||
        pair.source?.pikkuFuncId?.toLowerCase().includes(q) ||
        pair.trigger?.pikkuFuncId?.toLowerCase().includes(q)
      }
      emptyMessage={m.triggers_empty_message()}
      emptyHero={emptyHero}
      loading={loading}
    />
  )
}
