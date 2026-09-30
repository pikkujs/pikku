import React, { useEffect, useMemo, useState } from 'react'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import {
  Alert,
  Box,
  Button,
  Code,
  Group,
  Stack,
  Text,
  useComputedColorScheme,
} from '@pikku/mantine/core'
import { AlertTriangle, Save } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { html } from '@codemirror/lang-html'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { useUpdateEmailTemplate } from '../../hooks/useCodeEdit'

export const EmailSourceEditor: React.FC<{
  templateName: string
  source: string
}> = ({ templateName, source }) => {
  const colorScheme = useComputedColorScheme('dark')
  const [value, setValue] = useState(source)
  const updateEmailTemplate = useUpdateEmailTemplate()

  useEffect(() => {
    setValue(source)
  }, [source, templateName])

  const extensions = useMemo(
    () => [
      html(),
      ...(colorScheme === 'dark'
        ? [oneDark]
        : [syntaxHighlighting(defaultHighlightStyle, { fallback: true })]),
      EditorView.theme(
        {
          '&': {
            backgroundColor: 'var(--app-panel-bg)',
            color: 'var(--app-text)',
          },
          '.cm-content': { caretColor: 'var(--app-text)' },
          '.cm-gutters': {
            backgroundColor: 'var(--app-panel-bg)',
            color: 'var(--app-text-dim)',
            borderRight: '1px solid var(--app-border) !important',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'var(--app-panel-bg-strong)',
          },
          '.cm-activeLine': { backgroundColor: 'var(--app-input-bg)' },
        },
        { dark: colorScheme === 'dark' }
      ),
    ],
    [colorScheme]
  )

  const dirty = value !== source

  return (
    <Stack gap="sm" miw={0}>
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Text size="sm" c="dimmed" miw={0}>
          {m.emails_editing_template_prefix()}
          <Code>templates/{templateName}.html</Code>
          {m.emails_editing_template_suffix()}
        </Text>
        <Button
          size="xs"
          leftSection={<Save size={14} />}
          loading={updateEmailTemplate.isPending}
          disabled={!dirty || updateEmailTemplate.isPending}
          onClick={() =>
            updateEmailTemplate.mutate({ templateName, source: value })
          }
          data-testid="emails-source-save"
        >
          {m.common_save()}
        </Button>
      </Group>
      {updateEmailTemplate.isError && (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {updateEmailTemplate.error instanceof Error
            ? asI18n(updateEmailTemplate.error.message)
            : m.emails_dev_save_failed()}
        </Alert>
      )}
      <Box
        miw={0}
        w="100%"
        style={{
          border: '1px solid var(--app-border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <CodeMirror
          value={value}
          width="100%"
          height="480px"
          theme={colorScheme === 'dark' ? 'dark' : 'light'}
          extensions={extensions}
          onChange={setValue}
        />
      </Box>
    </Stack>
  )
}
