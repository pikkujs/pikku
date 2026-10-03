import React from 'react'
import { Alert, Code, Divider, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { PikkuBadge } from '../ui/PikkuBadge'
import { docBlocks } from './surface-docs'
import { originText } from './surface-copy'
import type { SurfaceSymbol, SurfaceSymbolUsage } from './surface.types'

export type SurfaceSymbolDetailProps = {
  symbol: SurfaceSymbol
  specifier: string
  /** Absent on the website, where usage cannot be measured. */
  usage?: SurfaceSymbolUsage
}

/** An import line is one long line; the panel is narrow, so let it wrap rather
 *  than clip the half that says where the export comes from. */
const WRAP: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

/** A fenced example keeps the indentation its author wrote. */
const DOCS: React.CSSProperties = { whiteSpace: 'pre-wrap' }

/**
 * One export, answered in the order the questions arrive: how do I import it,
 * what is it, where did it come from, and — where the console can measure it —
 * whether this project actually calls it.
 */
export const SurfaceSymbolDetail: React.FC<SurfaceSymbolDetailProps> = ({
  symbol,
  specifier,
  usage,
}) => (
  <Stack gap="md" p="md">
    <Group gap="xs">
      <Text fw={600} ff="monospace">
        {asI18n(symbol.name)}
      </Text>
      <PikkuBadge type="label" color="gray">
        {asI18n(symbol.kind)}
      </PikkuBadge>
    </Group>

    {symbol.deprecated && (
      <Alert color="yellow" title={m.surface_deprecated()}>
        {asI18n(symbol.deprecated)}
      </Alert>
    )}

    {symbol.docs ? (
      <Stack gap="sm">
        {docBlocks(symbol.docs).map((block, index) =>
          block.kind === 'code' ? (
            <Code key={index} block style={DOCS}>
              {block.text}
            </Code>
          ) : (
            <Text key={index} size="sm">
              {asI18n(block.text)}
            </Text>
          )
        )}
      </Stack>
    ) : (
      <Text size="sm" c="dimmed" fs="italic">
        {m.surface_undocumented()}
      </Text>
    )}

    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {m.surface_import_hint()}
      </Text>
      <Code block style={WRAP}>
        {`import { ${symbol.name} } from '${specifier}'`}
      </Code>
    </Stack>

    <Divider />

    <Text size="sm" c="dimmed">
      {asI18n(originText(symbol.origin))}
    </Text>

    {usage && (
      <Stack gap={6}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {m.surface_used_in()}
        </Text>
        {usage.imports === 0 ? (
          <Text size="sm" c="dimmed" fs="italic">
            {m.surface_unused()}
          </Text>
        ) : (
          <>
            <Text size="xs" c="dimmed">
              {usage.imports === 1
                ? m.surface_imports_count_one()
                : m.surface_imports_count({ count: usage.imports })}
            </Text>
            <Stack gap={2}>
              {usage.files.map((file) => (
                <Text key={file} size="xs" ff="monospace" style={WRAP}>
                  {asI18n(file)}
                </Text>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    )}
  </Stack>
)
