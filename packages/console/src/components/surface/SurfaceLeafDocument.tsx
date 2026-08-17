import React, { useMemo } from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { DoorOpen } from 'lucide-react'
import { m } from '@/i18n/messages'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import { STEP_PROSE } from './surface-copy'
import type {
  SurfaceLeaf,
  SurfaceSymbol,
  SurfaceSymbolUsage,
} from './surface.types'

type SurfaceLeafDocumentProps = {
  leaf: SurfaceLeaf
  /** Absent on the website, where usage cannot be measured. */
  usage?: Record<string, SurfaceSymbolUsage>
  searchQuery?: string
}

/**
 * One door, read as documentation: what this step of the build is for, then
 * every entrypoint it hands you. Types and interfaces are already filtered out
 * upstream — this lists what you call, not what you annotate with.
 */
export const SurfaceLeafDocument: React.FC<SurfaceLeafDocumentProps> = ({
  leaf,
  usage,
  searchQuery,
}) => {
  const { openPanel } = usePanelContext()

  const columns = useMemo(() => {
    const base = [
      {
        key: 'name',
        header: m.surface_column_export(),
        width: 240,
        render: (symbol: SurfaceSymbol) => (
          <Text
            fw={500}
            ff="monospace"
            truncate
            td={symbol.deprecated ? 'line-through' : undefined}
            c={symbol.deprecated ? 'dimmed' : undefined}
          >
            {asI18n(symbol.name)}
          </Text>
        ),
      },
      {
        key: 'summary',
        header: m.surface_column_summary(),
        render: (symbol: SurfaceSymbol) =>
          symbol.summary ? (
            <Text size="sm" lineClamp={2}>
              {asI18n(symbol.summary)}
            </Text>
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              {m.surface_undocumented()}
            </Text>
          ),
      },
      {
        key: 'kind',
        header: m.surface_column_kind(),
        width: 120,
        render: (symbol: SurfaceSymbol) => (
          <PikkuBadge
            type="label"
            color="gray"
            style={{ minWidth: 'max-content' }}
          >
            {asI18n(symbol.kind)}
          </PikkuBadge>
        ),
      },
    ]

    if (!usage) return base

    return [
      ...base,
      {
        key: 'imports',
        header: m.surface_column_imports(),
        align: 'right' as const,
        width: 90,
        render: (symbol: SurfaceSymbol) => {
          const measured = usage[symbol.name]?.imports ?? 0
          return (
            <Text size="sm" c={measured ? undefined : 'dimmed'}>
              {asI18n(String(measured))}
            </Text>
          )
        },
      },
    ]
  }, [usage])

  return (
    <TableListPage
      title={leaf.specifier}
      icon={DoorOpen}
      docsHref="https://pikku.dev/docs/api"
      description={
        <Stack gap={6}>
          <Text size="sm" c="dimmed">
            {asI18n(STEP_PROSE[leaf.step]())}
          </Text>
          <Text size="sm">{asI18n(leaf.summary)}</Text>
        </Stack>
      }
      data={leaf.symbols}
      columns={columns}
      getKey={(symbol) => symbol.name}
      externalSearch={searchQuery}
      onRowClick={(symbol) =>
        openPanel('surfaceSymbol', symbol.name, leaf.specifier, {
          symbol,
          specifier: leaf.specifier,
          usage: usage?.[symbol.name],
        })
      }
      emptyMessage={m.surface_empty_title()}
    />
  )
}
