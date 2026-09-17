import React, { useEffect, useRef, useState } from 'react'
import { Box, Center, Loader, Text, UnstyledButton } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { Play } from 'lucide-react'
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
 * It rests as a poster frame the width of the footage rail and only grows its
 * controls once someone plays it, so a feature of fifteen scenarios reads as
 * fifteen thumbnails rather than fifteen media players. The bytes are fetched
 * into memory to carry the console's Authorization header, so a run that
 * mounted every scenario's recordings at once would pull the whole run down.
 */
export const ScenarioRunPlayer: React.FC<ScenarioRunPlayerProps> = ({
  runId,
  artifact,
  seekMs,
}) => {
  const { url, error, loading } = useScenarioArtifact(runId, artifact.path)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!video.current || seekMs === undefined) return
    video.current.currentTime = seekMs / 1000
  }, [seekMs, url])

  /**
   * A recording opens on a browser that has not navigated anywhere yet, so the
   * frame at zero is a blank page and every poster down the rail reads as an
   * empty box. Resting a little way in shows the app the scenario was driving.
   */
  const poster = () => {
    const element = video.current
    if (!element || seekMs !== undefined || element.currentTime > 0) return
    element.currentTime = Math.min(2, element.duration / 4)
  }

  return (
    <Box
      data-testid={`scenario-run-player-${artifact.path}`}
      style={{
        position: 'relative',
        aspectRatio: '16 / 10',
        borderRadius: 10,
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
        <video
          ref={video}
          src={url}
          controls={playing}
          preload="metadata"
          onLoadedMetadata={poster}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
            display: 'block',
          }}
        />
      )}
      {url && !playing && (
        <UnstyledButton
          aria-label={m.scenarios_footage_play()}
          onClick={() => {
            setPlaying(true)
            void video.current?.play()
          }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.04), rgba(0,0,0,0.34))',
          }}
        >
          <Box
            style={{
              width: 38,
              height: 38,
              borderRadius: 38,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.35)',
            }}
          >
            <Play size={15} fill="white" color="white" />
          </Box>
        </UnstyledButton>
      )}
    </Box>
  )
}
