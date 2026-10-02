import { useState } from 'react'
import { Button, Group, Stack, Text } from '@pikku/mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FolderInput } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { studioCall, useStudioAction } from './studio'

interface KeepStatus {
  folder: string
  target: string | null
  commits: { sha: string; subject: string }[]
  unsaved: number
}

type KeepResult = { ok: true; kept: number } | { ok: false; reason: 'conflict' | 'edited'; files: string[] }

export function KeepChanges({ projectKey }: { projectKey: string }) {
  const client = useQueryClient()
  const status = useQuery({
    queryKey: ['studio', 'keep', projectKey],
    queryFn: () => studioCall<KeepStatus>('keepStatus', { key: projectKey }),
    refetchInterval: 10000,
  })
  const keep = useStudioAction<{ key: string }, KeepResult>('keepChanges')
  const [result, setResult] = useState<KeepResult | null>(null)
  const data = status.data
  if (!data) return null
  const waiting = data.commits.length + (data.unsaved > 0 ? 1 : 0)
  const folder = data.folder.split('/').pop() ?? data.folder

  return (
    <Stack gap={8} p="sm" style={{ borderTop: '1px solid var(--app-border)' }} data-testid="keep-changes">
      <Group gap={8} wrap="nowrap">
        <FolderInput size={15} />
        <Text size="sm" fw={600}>
          {m.studio_keep_title()}
        </Text>
      </Group>
      {result && !result.ok ? (
        <Stack gap={4} data-testid="keep-blocked">
          <Text size="sm" c="red">
            {result.reason === 'conflict' ? m.studio_keep_conflict({ folder }) : m.studio_keep_edited({ folder })}
          </Text>
          {result.files.slice(0, 8).map((file) => (
            <Text key={file} size="xs" ff="monospace" c="dimmed">
              {asI18n(file)}
            </Text>
          ))}
        </Stack>
      ) : waiting === 0 ? (
        <Group gap={6} wrap="nowrap">
          <Check size={14} color="var(--app-green)" />
          <Text size="sm" c="dimmed">
            {result?.ok ? m.studio_keep_done({ folder }) : m.studio_keep_nothing({ folder })}
          </Text>
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          {m.studio_keep_waiting({ folder })}
        </Text>
      )}
      {waiting > 0 && (
        <Button
          size="xs"
          leftSection={<FolderInput size={14} />}
          loading={keep.isPending}
          data-testid="keep-changes-button"
          onClick={() =>
            keep.mutate(
              { key: projectKey },
              {
                onSuccess: (outcome) => {
                  setResult(outcome)
                  void client.invalidateQueries({ queryKey: ['studio', 'keep', projectKey] })
                  void client.invalidateQueries({ queryKey: ['studio', 'git-log'] })
                },
              }
            )
          }
        >
          {m.studio_keep_button({ folder })}
        </Button>
      )}
    </Stack>
  )
}
