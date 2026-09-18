import React, { useState } from 'react'
import {
  Box,
  Center,
  Loader,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { ScenarioArtifact } from '@pikku/core/scenario'
import { useScenarioArtifact } from '../../../hooks/useScenarioRuns'

type ScenarioArtifactTileProps = {
  runId: string
  artifact: ScenarioArtifact
}

/**
 * One recorded still, cropped to a thumbnail in the footage rail and opened at
 * full size on click — the shot is a whole browser window, so shrunk to the
 * rail nothing in it is readable and it only reads as a duplicate of the
 * recording beside it. Recordings are not tiles: they belong to the scenario
 * and are driven by its step ladder, in ScenarioRunPlayer.
 */
export const ScenarioArtifactTile: React.FC<ScenarioArtifactTileProps> = ({
  runId,
  artifact,
}) => {
  const { url, error, loading } = useScenarioArtifact(runId, artifact.path)
  const [open, setOpen] = useState(false)
  const caption = artifact.name ?? artifact.path.split('/').pop() ?? ''

  const frame = (
    <Box
      style={{
        position: 'relative',
        aspectRatio: '16 / 10',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-default)',
      }}
    >
      {loading && (
        <Center h="100%">
          <Loader size="xs" />
        </Center>
      )}
      {error && (
        <Center h="100%" p="xs">
          <Text size="xs" c="dimmed" ta="center">
            {asI18n(error)}
          </Text>
        </Center>
      )}
      {url && (
        <img
          src={url}
          alt={caption}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
            display: 'block',
          }}
        />
      )}
    </Box>
  )

  return (
    <Stack gap={4} data-testid={`scenario-artifact-${artifact.path}`}>
      {url ? (
        <UnstyledButton
          aria-label={m.scenarios_footage_open_still()}
          onClick={() => setOpen(true)}
          style={{ display: 'block', width: '100%' }}
        >
          {frame}
        </UnstyledButton>
      ) : (
        frame
      )}
      <Text size="xs" c="dimmed" tt="uppercase" fz={10} lh={1.4} lineClamp={1}>
        {artifact.actor
          ? m.scenario_runs_artifact_caption_actor({
              caption,
              actor: artifact.actor,
            })
          : asI18n(caption)}
      </Text>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        size="90%"
        title={asI18n(caption)}
      >
        {url && (
          <img
            src={url}
            alt={caption}
            style={{ width: '100%', display: 'block' }}
          />
        )}
      </Modal>
    </Stack>
  )
}
