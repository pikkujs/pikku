import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Group, Stack, Text, UnstyledButton } from '@pikku/mantine/core'
import { Image as ImageIcon, Video } from 'lucide-react'
import { asI18n } from '@pikku/react'
import type { ScenarioArtifact } from '@pikku/core/scenario'
import { ScenarioRunPlayer } from './ScenarioRunPlayer'
import { ScenarioArtifactTile } from './ScenarioArtifactTile'

type ScenarioFootageProps = {
  runId: string
  artifacts: ScenarioArtifact[]
  seekMs?: number
}

const artifactLabel = (artifact: ScenarioArtifact) =>
  artifact.kind === 'video' ? (artifact.actor ?? artifact.kind) : artifact.kind

/**
 * The column beside a scenario, holding whatever the run recorded of it.
 *
 * One artifact is open at a time and only that one is fetched: the bytes come
 * through the console's Authorization header into memory, so a suite view that
 * opened every recording at once would pull the whole artifact store. The rest
 * are named in a strip underneath rather than shown as image thumbnails, for
 * the same reason — a thumbnail costs the same bytes as the full artifact.
 *
 * Nothing is fetched until the column is scrolled to.
 */
export const ScenarioFootage: React.FC<ScenarioFootageProps> = ({
  runId,
  artifacts,
  seekMs,
}) => {
  const ordered = useMemo(
    () =>
      [...artifacts].sort(
        (left, right) =>
          Number(right.kind === 'video') - Number(left.kind === 'video')
      ),
    [artifacts]
  )
  const [openPath, setOpenPath] = useState<string>()
  const open =
    ordered.find((artifact) => artifact.path === openPath) ?? ordered[0]
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

  if (!open) return null

  return (
    <Stack
      ref={column}
      gap="xs"
      data-testid="scenario-footage"
      style={{ flex: '0 1 320px', minWidth: 220, maxWidth: 340 }}
    >
      {!reached && (
        <Box
          style={{
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-default)',
            height: 180,
          }}
        />
      )}

      {reached && open.kind === 'video' && (
        <ScenarioRunPlayer runId={runId} artifact={open} seekMs={seekMs} />
      )}
      {reached && open.kind !== 'video' && (
        <ScenarioArtifactTile runId={runId} artifact={open} />
      )}

      {ordered.length > 1 && (
        <Group gap={6}>
          {ordered.map((artifact) => {
            const active = artifact.path === open.path
            const Icon = artifact.kind === 'video' ? Video : ImageIcon
            return (
              <UnstyledButton
                key={artifact.path}
                onClick={() => setOpenPath(artifact.path)}
                data-testid={`scenario-footage-pick-${artifact.path}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: `1px solid ${
                    active
                      ? 'var(--mantine-primary-color-filled)'
                      : 'var(--mantine-color-default-border)'
                  }`,
                  background: active
                    ? 'var(--mantine-primary-color-light)'
                    : 'transparent',
                }}
              >
                <Icon size={12} />
                <Text size="xs" c={active ? undefined : 'dimmed'}>
                  {asI18n(artifactLabel(artifact))}
                </Text>
              </UnstyledButton>
            )
          })}
        </Group>
      )}
    </Stack>
  )
}
