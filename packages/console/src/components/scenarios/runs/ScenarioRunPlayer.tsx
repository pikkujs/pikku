import React, { useEffect, useRef } from 'react'
import { Box, Center, Loader, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioArtifact } from '@pikku/core/scenario'
import { useScenarioArtifact } from '../../../hooks/useScenarioRuns'

type ScenarioRunPlayerProps = {
  runId: string
  artifact: ScenarioArtifact
  seekMs?: number
}

/**
 * The scenario's recording, seeked by whichever step is selected.
 *
 * A scenario that casts several apps records one video per actor, and they
 * stack down the footage column captioned by actor. The bytes are fetched into
 * memory to carry the console's Authorization header, so a run that mounted
 * every scenario's recordings at once would pull the whole run down with it.
 */
export const ScenarioRunPlayer: React.FC<ScenarioRunPlayerProps> = ({
  runId,
  artifact,
  seekMs,
}) => {
  const { url, error, loading } = useScenarioArtifact(runId, artifact.path)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!video.current || seekMs === undefined) return
    video.current.currentTime = seekMs / 1000
  }, [seekMs, url])

  return (
    <Stack gap={4} data-testid={`scenario-run-player-${artifact.path}`}>
      <Box
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-default)',
          minHeight: 120,
        }}
      >
        {loading && (
          <Center h={120}>
            <Loader size="xs" />
          </Center>
        )}
        {error && (
          <Center h={120} p="xs">
            <Text size="xs" c="dimmed">
              {asI18n(error)}
            </Text>
          </Center>
        )}
        {url && (
          <video
            ref={video}
            src={url}
            controls
            preload="metadata"
            style={{ width: '100%', display: 'block' }}
          />
        )}
      </Box>
      <Text size="xs" c="dimmed">
        {artifact.actor
          ? m.scenario_runs_artifact_caption_actor({
              caption: m.scenario_runs_recording(),
              actor: artifact.actor,
            })
          : m.scenario_runs_recording()}
      </Text>
    </Stack>
  )
}
