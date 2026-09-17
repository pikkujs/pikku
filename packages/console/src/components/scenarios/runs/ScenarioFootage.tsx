import React, { useEffect, useRef, useState } from 'react'
import { Box, Center, Stack, Text } from '@pikku/mantine/core'
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
 * The column beside a scenario, holding whatever the run recorded of it.
 *
 * Every artifact is fetched into memory to carry the console's Authorization
 * header, so a suite view that mounted all of them at once would pull the whole
 * artifact store. Nothing is fetched until the column is scrolled to, which is
 * what lets the footage sit here unasked rather than behind a link.
 */
export const ScenarioFootage: React.FC<ScenarioFootageProps> = ({
  runId,
  status,
  artifacts,
  seekMs,
}) => {
  const column = useRef<HTMLDivElement>(null)
  const [reached, setReached] = useState(false)

  useEffect(() => {
    if (reached || !column.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setReached(true)
    })
    observer.observe(column.current)
    return () => observer.disconnect()
  }, [reached])

  const waiting = WAITING_LABEL[status]
  if (artifacts.length === 0 && !waiting) return null

  const recordings = artifacts.filter((artifact) => artifact.kind === 'video')
  const stills = artifacts.filter((artifact) => artifact.kind !== 'video')

  return (
    <Stack
      ref={column}
      gap="sm"
      data-testid="scenario-footage"
      style={{ flex: '0 1 340px', minWidth: 240, maxWidth: 380 }}
    >
      {artifacts.length === 0 && waiting && (
        <Box
          style={{
            borderRadius: 8,
            border: '1px dashed var(--mantine-color-default-border)',
            background: 'var(--mantine-color-default)',
            height: 160,
          }}
        >
          <Center h={160}>
            <Text size="xs" c="dimmed">
              {waiting()}
            </Text>
          </Center>
        </Box>
      )}

      {reached &&
        recordings.map((artifact) => (
          <ScenarioRunPlayer
            key={artifact.path}
            runId={runId}
            artifact={artifact}
            seekMs={seekMs}
          />
        ))}
      {reached &&
        stills.map((artifact) => (
          <ScenarioArtifactTile
            key={artifact.path}
            runId={runId}
            artifact={artifact}
          />
        ))}

      {!reached && artifacts.length > 0 && (
        <Box
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-default)',
            height: 180,
          }}
        />
      )}
    </Stack>
  )
}
