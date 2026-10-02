import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Stack,
  Text,
  Textarea,
  Title,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Save } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { plural } from '@/i18n/plural'
import { STATUS_TONE_COLOR } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevNote } from '../ui/DevDetail'
import {
  errorText,
  useCommitChanges,
  type GitStatusEntry,
} from '../../hooks/useProjectCode'

/** The side-panel form that saves (commits) the chosen changed files with a message. */
export const CodeSavePanel: React.FC<{ files: GitStatusEntry[] }> = ({
  files,
}) => {
  useLocale()
  const commit = useCommitChanges()
  const [message, setMessage] = useState('')
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(files.map((file) => file.path))
  )
  const paths = files.map((file) => file.path).join('\n')

  useEffect(() => {
    setPicked(new Set(paths ? paths.split('\n') : []))
  }, [paths])

  const chosen = files.filter((file) => picked.has(file.path))
  const toggle = (path: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const save = () =>
    commit.mutate(
      { message, paths: chosen.map((file) => file.path) },
      { onSuccess: () => setMessage('') }
    )

  return (
    <Box
      style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
      p="md"
      data-testid="code-save-panel"
    >
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={3}>{m.code_save_title()}</Title>
          <Text size="sm" c="dimmed">
            {m.code_save_blurb()}
          </Text>
        </Stack>
        <Textarea
          label={m.code_save_message_label()}
          placeholder={m.code_save_message_placeholder()}
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          autosize
          minRows={3}
          data-testid="code-save-message"
        />
        <Stack gap={8}>
          <Text size="sm" fw={500}>
            {m.code_save_files()}
          </Text>
          {files.map((file) => (
            <Checkbox
              key={file.path}
              checked={picked.has(file.path)}
              onChange={() => toggle(file.path)}
              label={asI18n(file.path.split('/').pop() || file.path)}
              description={asI18n(file.path)}
              styles={{ description: { overflowWrap: 'anywhere' } }}
            />
          ))}
        </Stack>
        <Button
          leftSection={<Save size={16} />}
          disabled={!message.trim() || chosen.length === 0}
          loading={commit.isPending}
          onClick={save}
          data-testid="code-save-button"
        >
          {plural(chosen.length, m.code_save_button_one, m.code_save_button)}
        </Button>
        {commit.isSuccess && (
          <Alert
            variant="light"
            color={STATUS_TONE_COLOR.good}
            data-testid="code-save-result"
          >
            {commit.data.status === 'noop'
              ? m.code_save_noop()
              : m.code_save_done()}
          </Alert>
        )}
        {commit.isError && (
          <>
            <Alert
              variant="light"
              color={STATUS_TONE_COLOR.bad}
              data-testid="code-save-result"
            >
              {m.code_save_failed()}
            </Alert>
            <ForDevelopers testId="code-save-developers">
              <DevNote>{asI18n(errorText(commit.error))}</DevNote>
            </ForDevelopers>
          </>
        )}
      </Stack>
    </Box>
  )
}
