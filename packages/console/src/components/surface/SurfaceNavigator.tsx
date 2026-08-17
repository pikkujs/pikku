import React from 'react'
import {
  Box,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { ENTRY_POINT_LABEL } from './surface-copy'
import { stepsOf } from './surface-steps'
import type { SurfaceDoc, SurfaceEntryPoint } from './surface.types'
import classes from '../ui/console.module.css'

type SurfaceNavigatorProps = {
  doc: SurfaceDoc
  entryPoint: SurfaceEntryPoint
  onSelectEntryPoint: (id: string) => void
  selectedSpecifier: string | null
  onSelectLeaf: (specifier: string) => void
}

/**
 * The three doors into core, and under the chosen one its leaves in build order
 * rather than alphabetically — the order decides what the page teaches, so it is
 * the navigation rather than a heading above it.
 */
export const SurfaceNavigator: React.FC<SurfaceNavigatorProps> = ({
  doc,
  entryPoint,
  onSelectEntryPoint,
  selectedSpecifier,
  onSelectLeaf,
}) => {
  const groups = stepsOf(entryPoint)

  return (
    <ScrollArea style={{ height: '100%' }} data-testid="surface-navigator">
      <Stack gap="xs" p="xs">
        <SegmentedControl
          fullWidth
          size="xs"
          orientation="vertical"
          value={entryPoint.id}
          onChange={onSelectEntryPoint}
          data={doc.entryPoints.map((each) => ({
            value: each.id,
            label: ENTRY_POINT_LABEL[each.id](),
          }))}
        />

        {groups.map((group) => (
          <Stack gap={2} key={group.step}>
            <Box className={classes.knowledgeRow} style={{ paddingLeft: 10 }}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                {asI18n(group.step)}
              </Text>
            </Box>

            {group.leaves.map((leaf) => (
              <UnstyledButton
                key={leaf.specifier}
                data-testid={`surface-nav-${leaf.specifier}`}
                data-selected={
                  leaf.specifier === selectedSpecifier || undefined
                }
                aria-current={leaf.specifier === selectedSpecifier || undefined}
                onClick={() => onSelectLeaf(leaf.specifier)}
                className={classes.knowledgeRow}
                style={{ paddingLeft: 22 }}
              >
                <Text
                  size="sm"
                  ff="monospace"
                  fw={leaf.specifier === selectedSpecifier ? 600 : 500}
                  lineClamp={1}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {asI18n(leaf.specifier)}
                </Text>
                <Text size="xs" c="dimmed">
                  {asI18n(String(leaf.symbols.length))}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        ))}
      </Stack>
    </ScrollArea>
  )
}
