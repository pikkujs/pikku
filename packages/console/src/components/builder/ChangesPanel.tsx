import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Stack, Text, Textarea } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n, type I18nString } from '@pikku/react'
import { Center, Loader } from '@pikku/mantine/core'
import { Check } from 'lucide-react'
import { callSandboxControlRpc } from './sandboxControl'
import styles from '../../studio/StudioAppsPage.module.css'

const PageLoader = () => <Center p="md"><Loader size="sm" /></Center>

type GitFileStatus = 'staged' | 'modified' | 'untracked' | 'deleted' | 'renamed'
type GitStatusFile = { path: string; status: GitFileStatus }

const FILE_STATUS_META: Record<
  GitFileStatus,
  { label: () => I18nString; letter: string; color: string }
> = {
  staged: { label: m.builder_changes_staged, letter: 'S', color: 'var(--app-green)' },
  modified: { label: m.builder_changes_modified, letter: 'M', color: 'var(--app-amber)' },
  untracked: { label: m.builder_changes_new, letter: '+', color: 'var(--app-blue)' },
  deleted: { label: m.builder_changes_deleted, letter: 'D', color: 'var(--app-red)' },
  renamed: { label: m.builder_changes_renamed, letter: 'R', color: 'var(--app-text-dim)' },
}

export function ChangesPanel({ onSaved }: { onSaved?: () => void }) {
  useLocale()
  const runtimeBaseUrl = 'local'
  const builderToken = 'local'
  const [files, setFiles] = useState<GitStatusFile[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!runtimeBaseUrl || !builderToken) return
    setLoading(true)
    try {
      const status = await callSandboxControlRpc<{ files: GitStatusFile[]; branch: string | null }>(
        runtimeBaseUrl,
        'getSandboxGitStatus',
        {},
        builderToken,
      )
      setFiles(status.files)
      setBranch(status.branch)
    } finally {
      setLoading(false)
    }
  }, [runtimeBaseUrl, builderToken])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSave = async () => {
    if (!runtimeBaseUrl || !builderToken || !message.trim() || files.length === 0) return
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await callSandboxControlRpc(
        runtimeBaseUrl,
        'commitSandboxChanges',
        { message: message.trim(), paths: files.map((f) => f.path) },
        builderToken,
      )
      onSaved?.()
      setSaveStatus('done')
      setMessage('')
      setFiles([])
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : m.builder_chat_commit_save_failed())
      setSaveStatus('error')
    }
  }

  const grouped = (Object.keys(FILE_STATUS_META) as GitFileStatus[])
    .map((s) => ({ status: s, group: files.filter((f) => f.status === s) }))
    .filter(({ group }) => group.length > 0)

  if (loading) return <PageLoader />

  if (saveStatus === 'done') {
    return (
      <div className={styles.commitState}>
        <Group gap={8}>
          <Check size={14} color="var(--app-green)" />
          <Text size="sm">{m.builder_changes_saved()}</Text>
        </Group>
        <Button
          size="xs"
          variant="subtle"
          mt="sm"
          onClick={() => {
            setSaveStatus('idle')
            void refresh()
          }}
        >
          {m.builder_changes_check_again()}
        </Button>
      </div>
    )
  }

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      {files.length === 0 ? (
        <div className={styles.commitState}>{m.builder_changes_no_changes()}</div>
      ) : (
        <Stack gap={0} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {grouped.map(({ status, group }) => {
            const meta = FILE_STATUS_META[status]
            return (
              <Stack key={status} gap={0}>
                <Group gap={6} px={14} py={4}>
                  <Text
                    size="xs"
                    fw={600}
                    tt="uppercase"
                    style={{ letterSpacing: '0.06em', color: meta.color }}
                  >
                    {meta.label()}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {group.length}
                  </Text>
                </Group>
                {group.map((f) => {
                  const parts = f.path.split('/')
                  const name = parts[parts.length - 1] ?? f.path
                  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : ''
                  return (
                    <Group
                      key={f.path}
                      gap={6}
                      px={14}
                      py={3}
                      wrap="nowrap"
                      style={{ minWidth: 0 }}
                    >
                      <Text
                        size="xs"
                        fw={700}
                        ff="monospace"
                        style={{ color: meta.color, minWidth: 10 }}
                      >
                        {asI18n(meta.letter)}
                      </Text>
                      <Text
                        size="xs"
                        ff="monospace"
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flexShrink: 0,
                          maxWidth: 200,
                        }}
                      >
                        {asI18n(name)}
                      </Text>
                      {dir && (
                        <Text
                          size="xs"
                          ff="monospace"
                          c="dimmed"
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {asI18n(dir)}
                        </Text>
                      )}
                    </Group>
                  )
                })}
              </Stack>
            )
          })}
        </Stack>
      )}
      {files.length > 0 && (
        <div
          style={{
            borderTop: '1px solid var(--app-border)',
            background: 'var(--app-panel-bg-strong)',
            padding: '10px 14px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {branch && (
            <Text size="xs" c="dimmed" ff="monospace">
              {asI18n(branch)}
            </Text>
          )}
          <Textarea
            size="xs"
            placeholder={m.builder_changes_commit_placeholder()}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            disabled={saveStatus === 'saving'}
            autosize
            minRows={2}
            maxRows={5}
            styles={{ input: { fontFamily: 'inherit', fontSize: 12, lineHeight: 1.5 } }}
          />
          {saveError ? (
            <Alert color="red" variant="light" py={6} px={10}>
              {asI18n(saveError)}
            </Alert>
          ) : null}
          <Button
            fullWidth
            size="xs"
            loading={saveStatus === 'saving'}
            disabled={!message.trim()}
            onClick={() => {
              void handleSave()
            }}
            leftSection={<Check size={12} />}
          >
            {m.studio_changes_save({ count: files.length })}
          </Button>
        </div>
      )}
    </Stack>
  )
}
