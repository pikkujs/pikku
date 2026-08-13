import React, { useEffect, useMemo, useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import {
  Alert,
  Box,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  useComputedColorScheme,
} from '@pikku/mantine/core'
import {
  AlertTriangle,
  Mail,
  Monitor,
  Smartphone,
  Code2,
  Save,
  FileText,
} from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { html } from '@codemirror/lang-html'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { EmailsComposePanel } from '../components/emails/EmailsComposePanel'
import { useEmailsCompose } from '../hooks/useEmailsCompose'
import type { EmailsCompose } from '../hooks/useEmailsCompose'
import { useListSurfaceClass } from '../context/ConsoleChromeContext'
import { useUpdateEmailTemplate } from '../hooks/useCodeEdit'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { PikkuSwitch } from '../components/ui/PikkuSwitch'
import { EmailsOverview } from './EmailsOverview'
import classes from '../components/ui/console.module.css'

const EMAIL_DOCS_HREF = 'https://pikku.dev/docs'

export interface EmailsPageProps {
  hero?: React.ReactNode
  headerRight?: React.ReactNode
  /** Compose state owned by the host (see `useEmailsCompose`). Supplying it
   *  means the host mounts `EmailsComposePanel` itself, so this drops its own
   *  form column and gives the preview the full width. */
  compose?: EmailsCompose
}

/** "confirm-email" -> "Confirm Email" for human-friendly display. */
function humanizeTemplateName(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export const EmailsPage: React.FC<EmailsPageProps> = ({
  hero,
  headerRight,
  compose: hostCompose,
}) => {
  useLocale()
  const colorScheme = useComputedColorScheme('dark')
  const surfaceClass = useListSurfaceClass()
  const [previewMode, setPreviewMode] = useState<
    'desktop' | 'mobile' | 'html' | 'text'
  >('desktop')
  const [editorValue, setEditorValue] = useState<string>('')

  // Always mounted so the hook order never depends on the prop; inert when the
  // host owns the state, so it issues no preview of its own.
  const ownCompose = useEmailsCompose({ enabled: !hostCompose })
  const compose = hostCompose ?? ownCompose
  const {
    templates,
    templateNames,
    selectedTemplate,
    selectedMeta,
    selectedLocale,
    localeOptions,
    preview,
    loading,
  } = compose

  const templateItems = useMemo(
    () =>
      templateNames.map((templateName) => ({
        label: templateName,
        value: templateName,
      })),
    [templateNames]
  )

  const editorTheme = useMemo(
    () =>
      EditorView.theme(
        {
          '&': {
            backgroundColor: 'var(--app-panel-bg)',
            color: 'var(--app-text)',
          },
          '.cm-content': {
            caretColor: 'var(--app-text)',
          },
          '.cm-gutters': {
            backgroundColor: 'var(--app-panel-bg)',
            color: 'var(--app-text-dim)',
            borderRight: '1px solid var(--app-border) !important',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'var(--app-panel-bg-strong)',
          },
          '.cm-activeLine': {
            backgroundColor: 'var(--app-input-bg)',
          },
        },
        { dark: colorScheme === 'dark' }
      ),
    [colorScheme]
  )
  const editorExtensions = useMemo(
    () => [
      html(),
      ...(colorScheme === 'dark'
        ? [oneDark]
        : [
            syntaxHighlighting(defaultHighlightStyle, {
              fallback: true,
            }),
          ]),
      editorTheme,
    ],
    [colorScheme, editorTheme]
  )

  // Sync the editor to the raw template source whenever it (re)loads — including
  // after a successful save, when the invalidated preview refetches the new source.
  const templateSource = preview.data?.source ?? ''
  useEffect(() => {
    setEditorValue(templateSource)
  }, [templateSource, selectedTemplate])

  const updateEmailTemplate = useUpdateEmailTemplate()
  const sourceDirty = editorValue !== templateSource

  if (loading) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={
            <ListPageHeader
              title={m.emails_title()}
              description={m.emails_description()}
            />
          }
        >
          <Center h="100%">
            <Loader />
          </Center>
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  if (templateNames.length === 0) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={
            <ListPageHeader
              title={m.emails_title()}
              description={m.emails_description()}
            />
          }
        >
          <EmptyStatePlaceholder
            icon={Mail}
            hero={hero}
            title={m.emails_no_templates_title()}
            description={m.emails_no_templates_description()}
            code="pikku emails generate"
            docsHref={EMAIL_DOCS_HREF}
          />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  if (!selectedTemplate || !selectedMeta || !selectedLocale) {
    return (
      <ConsoleSurface>
        <EmailsOverview
          templateNames={templateNames}
          templates={templates}
          headerRight={headerRight}
          onSelect={compose.selectTemplate}
        />
      </ConsoleSurface>
    )
  }

  const headerControls = (
    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0, minWidth: 0 }}>
      <Select
        aria-label={m.emails_template_selector()}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data={templateItems}
        value={selectedTemplate}
        onChange={(value) => {
          if (!value) return
          compose.selectTemplate(value)
        }}
        allowDeselect={false}
        searchable
        size="xs"
        w={220}
        leftSection={<Mail size={14} />}
      />
      <Select
        aria-label={m.emails_locale_selector()}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data={localeOptions}
        value={selectedLocale}
        onChange={(value) => {
          if (!value) return
          compose.selectLocale(value)
        }}
        allowDeselect={false}
        size="xs"
        w={88}
      />
      <PikkuSwitch
        ariaLabel={m.emails_preview_mode_selector()}
        value={previewMode}
        onChange={setPreviewMode}
        options={[
          {
            value: 'desktop',
            label: m.emails_preview_mode_desktop(),
            icon: <Monitor size={14} />,
          },
          {
            value: 'mobile',
            label: m.emails_preview_mode_mobile(),
            icon: <Smartphone size={14} />,
          },
          {
            value: 'text',
            label: m.emails_preview_mode_text(),
            icon: <FileText size={14} />,
          },
          {
            value: 'html',
            label: m.emails_preview_mode_html(),
            icon: <Code2 size={14} />,
          },
        ]}
      />
      {headerRight}
    </Group>
  )

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title={m.emails_title()}
            description={asI18n(
              preview.data?.subject || humanizeTemplateName(selectedTemplate)
            )}
            lead={headerControls}
          />
        }
      >
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            gap: 'var(--mantine-spacing-md)',
          }}
        >
          {/* Preview area */}
          <Box
            className={hostCompose ? surfaceClass : classes.listSurfaceCard}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              px="md"
              py="sm"
              style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
                flexShrink: 0,
              }}
            >
              <Text fw={600} truncate>
                {asI18n(humanizeTemplateName(selectedTemplate))}
              </Text>
            </Box>

            <Box
              style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' }}
              p="md"
            >
              <Stack gap="md" style={{ minWidth: 0 }}>
                {preview.isLoading ? (
                  <Center py="xl">
                    <Loader />
                  </Center>
                ) : null}
                {preview.error ? (
                  <Alert color="red" icon={<AlertTriangle size={16} />}>
                    {asI18n(
                      preview.error instanceof Error
                        ? preview.error.message
                        : 'Failed to render email preview'
                    )}
                  </Alert>
                ) : null}
                {preview.data?.missing?.length ? (
                  <Alert color="yellow" icon={<AlertTriangle size={16} />}>
                    {asI18n(
                      `Missing source files: ${preview.data.missing.join(', ')}`
                    )}
                  </Alert>
                ) : null}
                {previewMode === 'html' ? (
                  <Stack gap="sm" style={{ minWidth: 0 }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" c="dimmed" truncate>
                        {m.emails_editing_template_prefix()}
                        <Code>templates/{selectedTemplate}.html</Code>
                        {m.emails_editing_template_suffix()}
                      </Text>
                      <Button
                        size="xs"
                        leftSection={<Save size={14} />}
                        loading={updateEmailTemplate.isPending}
                        disabled={!sourceDirty || updateEmailTemplate.isPending}
                        onClick={() =>
                          updateEmailTemplate.mutate({
                            templateName: selectedTemplate,
                            source: editorValue,
                          })
                        }
                      >
                        {m.common_save()}
                      </Button>
                    </Group>
                    {updateEmailTemplate.isError ? (
                      <Alert color="red" icon={<AlertTriangle size={16} />}>
                        {asI18n(
                          updateEmailTemplate.error instanceof Error
                            ? updateEmailTemplate.error.message
                            : 'Failed to save email template'
                        )}
                      </Alert>
                    ) : null}
                    <Box
                      style={{
                        border: '1px solid var(--app-border)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
                      <CodeMirror
                        value={editorValue}
                        width="100%"
                        height="600px"
                        theme={colorScheme === 'dark' ? 'dark' : 'light'}
                        extensions={editorExtensions}
                        onChange={(value) => setEditorValue(value)}
                      />
                    </Box>
                  </Stack>
                ) : previewMode === 'text' ? (
                  preview.data?.text ? (
                    <Code block>{preview.data.text}</Code>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      {m.emails_no_text_version()}
                    </Text>
                  )
                ) : (
                  <Center py="sm">
                    {previewMode === 'desktop' ? (
                      <Box
                        style={{
                          width: '100%',
                          maxWidth: 960,
                          height: 720,
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: '#fff',
                        }}
                      >
                        <iframe
                          title="Desktop email preview"
                          srcDoc={preview.data?.html ?? ''}
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 0,
                            background: '#fff',
                          }}
                        />
                      </Box>
                    ) : (
                      <Box
                        style={{
                          width: 390,
                          maxWidth: '100%',
                          height: 720,
                          borderRadius: 24,
                          overflow: 'hidden',
                          background: '#fff',
                        }}
                      >
                        <iframe
                          title="Mobile email preview"
                          srcDoc={preview.data?.html ?? ''}
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 0,
                            background: '#fff',
                          }}
                        />
                      </Box>
                    )}
                  </Center>
                )}
              </Stack>
            </Box>
          </Box>

          {/* Form / render panel — omitted when the host mounts it itself. */}
          {!hostCompose && (
            <Box
              className={classes.listSurfaceCard}
              style={{
                width: 300,
                maxWidth: 300,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <EmailsComposePanel compose={compose} />
            </Box>
          )}
        </Box>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
