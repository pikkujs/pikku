import React, { useState } from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PikkuBadge } from '../ui/PikkuBadge'
import { originText } from './surface-copy'
import type { SurfaceSymbol, SurfaceSymbolUsage } from './surface.types'

export type SurfaceSymbolCardProps = {
  symbol: SurfaceSymbol
  specifier: string
  /** Absent on the website, where usage cannot be measured. */
  usage?: SurfaceSymbolUsage
  onOpen: (symbol: SurfaceSymbol) => void
}

/** The first few call sites read as evidence; the rest are a count, and the
 *  panel lists them all. */
const FILES_SHOWN = 3

/**
 * One export, as a row you can read without opening it: the line you would
 * type, the sentence its author wrote, where the symbol comes from, and — where
 * the console can measure it — the files that already import it.
 */
export const SurfaceSymbolCard: React.FC<SurfaceSymbolCardProps> = ({
  symbol,
  specifier,
  usage,
  onOpen,
}) => {
  const [hovered, setHovered] = useState(false)
  const files = usage?.files ?? []
  const used = (usage?.imports ?? 0) > 0

  return (
    <Box
      component="button"
      type="button"
      data-testid={`surface-card-${symbol.name}`}
      onClick={() => onOpen(symbol)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        background: hovered
          ? 'var(--mantine-color-default-hover)'
          : 'var(--app-surface, var(--mantine-color-body))',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'background 100ms',
        padding: '14px 18px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        columnGap: 24,
        rowGap: 8,
        alignItems: 'start',
      }}
    >
      <Stack gap={6} style={{ minWidth: 0 }}>
        <Group gap={8} wrap="wrap" align="center">
          <Text
            fw={600}
            ff="monospace"
            size="sm"
            td={symbol.deprecated ? 'line-through' : undefined}
            c={symbol.deprecated ? 'dimmed' : undefined}
          >
            {asI18n(symbol.name)}
          </Text>
          <PikkuBadge type="label" color="gray">
            {asI18n(symbol.kind)}
          </PikkuBadge>
          {symbol.deprecated && (
            <PikkuBadge type="label" color="yellow">
              {m.surface_deprecated()}
            </PikkuBadge>
          )}
        </Group>

        {symbol.summary ? (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {asI18n(symbol.summary)}
          </Text>
        ) : (
          <Text size="sm" c="dimmed" fs="italic">
            {m.surface_undocumented()}
          </Text>
        )}

        <Group gap={6} wrap="nowrap">
          <Text size="xs" c="dimmed" ff="monospace">
            {asI18n(`import { ${symbol.name} } from '${specifier}'`)}
          </Text>
        </Group>

        {used && (
          <Group gap={6} wrap="wrap">
            {files.slice(0, FILES_SHOWN).map((file) => (
              <Text key={file} size="xs" ff="monospace" c="dimmed">
                {asI18n(file)}
              </Text>
            ))}
            {files.length > FILES_SHOWN && (
              <Text size="xs" c="dimmed">
                {m.surface_more_files({ count: files.length - FILES_SHOWN })}
              </Text>
            )}
          </Group>
        )}
      </Stack>

      <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
        <Text size="xs" c="dimmed" ta="right">
          {asI18n(originText(symbol.origin))}
        </Text>
        {usage && (
          <Text size="xs" c={used ? undefined : 'dimmed'} ta="right">
            {!used
              ? m.surface_unused()
              : files.length === 1
                ? m.surface_used_in_one_file()
                : m.surface_used_in_files({ files: files.length })}
          </Text>
        )}
      </Stack>
    </Box>
  )
}
