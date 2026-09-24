import React, { useEffect, useRef, useState } from 'react'
import { Box, Center, SimpleGrid, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioArtifact } from '@pikku/core/scenario'
import type { ScenarioLensStatus } from '../scenario-run-lens'
import { ScenarioRunPlayer } from './ScenarioRunPlayer'
import { ScenarioArtifactTile } from './ScenarioArtifactTile'

type ScenarioFootageProps = {
  runId: string
  status: ScenarioLensStatus
  artifacts: ScenarioArtifact[]
  seekMs?: number
}

const WAITING_LABEL: Partial<Record<ScenarioLensStatus, () => string>> = {
  running: () => m.scenarios_footage_recording(),
  waiting: () => m.scenarios_footage_pending(),
  never: () => m.scenarios_footage_pending(),
}

/**
 * The rail beside a scenario, holding whatever the run recorded of it.
 *
 * It keeps its width whether or not there is anything in it, so the ladders
 * down a feature all measure the same and the recordings line up rather than
 * stepping in and out of the text. Nothing is fetched until the rail is
 * scrolled to — every artifact is pulled into memory to carry the console's
 * Authorization header, and a feature view mounts dozens of them.
 */
export const ScenarioFootage: React.FC<ScenarioFootageProps> = ({
  runId,
  status,
  artifacts,
  seekMs,
}) => {
  const rail = useRef<HTMLDivElement>(null)
  const [reached, setReached] = useState(false)

  useEffect(() => {
    if (reached || !rail.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setReached(true)
    })
    observer.observe(rail.current)
    return () => observer.disconnect()
  }, [reached])

  const waiting = WAITING_LABEL[status]
  const recordings = artifacts.filter((artifact) => artifact.kind === 'video')
  const stills = artifacts.filter((artifact) => artifact.kind !== 'video')

  return (
    <Stack ref={rail} gap={8} data-testid="scenario-footage">
      {artifacts.length === 0 && waiting && (
        <Box
          style={{
            aspectRatio: '16 / 10',
            borderRadius: 10,
            border: '1px dashed var(--mantine-color-default-border)',
          }}
        >
          <Center h="100%">
            <Text size="xs" c="dimmed">
              {asI18n(waiting())}
            </Text>
          </Center>
        </Box>
      )}

      {reached &&
        recordings.map((artifact) => (
          <Stack key={artifact.path} gap={4}>
            <ScenarioRunPlayer
              runId={runId}
              artifact={artifact}
              seekMs={seekMs}
            />
            {recordings.length > 1 && artifact.actor && (
              <Text size="xs" c="dimmed" tt="uppercase" fz={10} lh={1.4}>
                {asI18n(artifact.actor)}
              </Text>
            )}
          </Stack>
        ))}

      {reached && stills.length > 0 && (
        <SimpleGrid cols={stills.length > 1 ? 2 : 1} spacing={8}>
          {stills.map((artifact) => (
            <ScenarioArtifactTile
              key={artifact.path}
              runId={runId}
              artifact={artifact}
            />
          ))}
        </SimpleGrid>
      )}

      {!reached && artifacts.length > 0 && (
        <Box
          style={{
            aspectRatio: '16 / 10',
            borderRadius: 10,
            border: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-default)',
          }}
        />
      )}
    </Stack>
  )
}
