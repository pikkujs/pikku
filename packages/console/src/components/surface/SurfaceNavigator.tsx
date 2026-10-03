import React from 'react'
import {
  Box,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { stepsOf } from './surface-steps'
import type { SurfaceEntryPoint } from './surface.types'
import classes from '../ui/console.module.css'

type SurfaceNavigatorProps = {
  entryPoint: SurfaceEntryPoint
  selectedSpecifier: string | null
  onSelectLeaf: (specifier: string) => void
}

/**
 * The leaves of the chosen door, in build order rather than alphabetically — the
 * order decides what the page teaches, so it is the navigation rather than a
 * heading above it. Which door you are behind is the header's question, not
 * this list's: it reframes everything on the page, so it sits with the title.
 */
export const SurfaceNavigator: React.FC<SurfaceNavigatorProps> = ({
  entryPoint,
  selectedSpecifier,
  onSelectLeaf,
}) => {
  const groups = stepsOf(entryPoint)

  return (
    <ScrollArea style={{ height: '100%' }} data-testid="surface-navigator">
      <Stack gap="xs" p="xs">
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
