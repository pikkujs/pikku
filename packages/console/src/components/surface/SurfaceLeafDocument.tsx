import React, { useMemo } from 'react'
import { Box, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { usePanelContext } from '../../context/PanelContext'
import { STEP_PROSE } from './surface-copy'
import { SurfaceSymbolCard } from './SurfaceSymbolCard'
import type { SurfaceLeaf, SurfaceSymbolUsage } from './surface.types'

/** One export per row: a row has the width to carry the summary, the import
 *  line and the files that already use it, which a column of cards does not. */
const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 10,
  alignItems: 'stretch',
}

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

  const symbols = useMemo(() => {
    const query = searchQuery?.trim().toLowerCase()
    if (!query) return leaf.symbols
    return leaf.symbols.filter(
      (symbol) =>
        symbol.name.toLowerCase().includes(query) ||
        symbol.summary?.toLowerCase().includes(query)
    )
  }, [leaf.symbols, searchQuery])

  return (
    <Stack gap={0} h="100%" style={{ minHeight: 0 }}>
      <Box
        px="md"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Stack gap={6}>
          <Text fw={600} ff="monospace" size="sm">
            {asI18n(leaf.specifier)}
          </Text>
          <Text size="sm" c="dimmed">
            {asI18n(STEP_PROSE[leaf.step]())}
          </Text>
          <Text size="sm">{asI18n(leaf.summary)}</Text>
        </Stack>
      </Box>

      <Box p="md" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {symbols.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {m.surface_empty_title()}
          </Text>
        ) : (
          <Box style={GRID}>
            {symbols.map((symbol) => (
              <SurfaceSymbolCard
                key={symbol.name}
                symbol={symbol}
                specifier={leaf.specifier}
                usage={usage?.[symbol.name]}
                onOpen={() =>
                  openPanel('surfaceSymbol', symbol.name, leaf.specifier, {
                    symbol,
                    specifier: leaf.specifier,
                    usage: usage?.[symbol.name],
                  })
                }
              />
            ))}
          </Box>
        )}
      </Box>
    </Stack>
  )
}
