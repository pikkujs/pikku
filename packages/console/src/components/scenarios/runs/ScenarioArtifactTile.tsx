import React from 'react'
import { Box, Center, Loader, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioArtifact } from '@pikku/core/ecosystem/scenario'
import { useScenarioArtifact } from '../../../hooks/useScenarioRuns'

type ScenarioArtifactTileProps = {
  runId: string
  artifact: ScenarioArtifact
}

/**
 * One recorded moment. A video is a player rather than a thumbnail because
 * the whole reason to keep it is to watch what the browser actually did, and a
 * screenshot is shown at the size it was taken so text in it stays readable.
 */
export const ScenarioArtifactTile: React.FC<ScenarioArtifactTileProps> = ({
  runId,
  artifact,
}) => {
  const { url, error, loading } = useScenarioArtifact(runId, artifact.path)
  const caption = artifact.name ?? artifact.path.split('/').pop() ?? ''

  return (
    <Stack
      gap={4}
      data-testid={`scenario-artifact-${artifact.path}`}
      style={{ maxWidth: artifact.kind === 'video' ? 480 : 320 }}
    >
      <Box
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-default)',
          minHeight: 90,
        }}
      >
        {loading && (
          <Center h={90}>
            <Loader size="xs" />
          </Center>
        )}
        {error && (
          <Center h={90} p="xs">
            <Text size="xs" c="dimmed">
              {asI18n(error)}
            </Text>
          </Center>
        )}
        {url && artifact.kind === 'video' && (
          <video src={url} controls style={{ width: '100%', display: 'block' }} />
        )}
        {url && artifact.kind !== 'video' && (
          <img
            src={url}
            alt={caption}
            style={{ width: '100%', display: 'block' }}
          />
        )}
      </Box>
      <Text size="xs" c="dimmed" lineClamp={2}>
        {artifact.actor
          ? m.scenario_runs_artifact_caption_actor({
              caption,
              actor: artifact.actor,
            })
          : asI18n(caption)}
      </Text>
    </Stack>
  )
}
