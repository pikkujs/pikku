import React, { useEffect, useMemo, useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import type { RJSFSchema } from '@rjsf/utils'
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Code,
  Divider,
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
import { useSearchParams } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { SchemaForm } from '../components/ui/SchemaForm'
import { useRenderEmailPreview } from '../hooks/useWirings'
import { useUpdateEmailTemplate } from '../hooks/useCodeEdit'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { PikkuSwitch } from '../components/ui/PikkuSwitch'
import { EmailsOverview } from './EmailsOverview'
import classes from '../components/ui/console.module.css'

type EmailPreviewValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<unknown>

const EMAIL_DOCS_HREF = 'https://pikku.dev/docs'

/** "confirm-email" -> "Confirm Email" for human-friendly display. */
function humanizeTemplateName(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function buildVariablesSchema(variables: string[]): RJSFSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      variables.map((name) => [
        name,
        {
          type: 'string',
          title: name,
        },
      ])
    ),
  }
}

export const EmailsPage: React.FC<{
  hero?: React.ReactNode
  headerRight?: React.ReactNode
}> = ({ hero, headerRight }) => {
  useLocale()
  const colorScheme = useComputedColorScheme('dark')
  const { meta, loading } = usePikkuMeta()
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewInput, setPreviewInput] = useState<
    Record<string, EmailPreviewValue>
  >({})
  const [previewMode, setPreviewMode] = useState<
    'desktop' | 'mobile' | 'html' | 'text'
  >('desktop')
  const [editorValue, setEditorValue] = useState<string>('')

  const templates = meta.emailsMeta?.templates || {}
  const templateNames = useMemo(
    () => Object.keys(templates).sort((a, b) => a.localeCompare(b)),
    [templates]
  )

  const selectedTemplate = searchParams.get('template')
  const selectedMeta = selectedTemplate ? templates[selectedTemplate] : null
  const templateItems = useMemo(
    () =>
      templateNames.map((templateName) => ({
        label: templateName,
        value: templateName,
      })),
    [templateNames]
  )

  const localeOptions = useMemo(
    () =>
      Object.keys(selectedMeta?.locales ?? {})
        .sort((a, b) => a.localeCompare(b))
        .map((locale) => ({
          label: locale,
          value: locale,
        })),
    [selectedMeta]
  )

  const selectedLocaleParam = searchParams.get('locale')
  const selectedLocale = selectedMeta
    ? localeOptions.find((option) => option.value === selectedLocaleParam)
        ?.value ||
      localeOptions[0]?.value ||
      'en'
    : null

  useEffect(() => {
    if (!selectedTemplate || !selectedLocale) return
    if (searchParams.get('locale') !== selectedLocale) {
      setSearchParams(
        {
          template: selectedTemplate,
          locale: selectedLocale,
        },
        { replace: true }
      )
    }
  }, [searchParams, selectedLocale, selectedTemplate, setSearchParams])

  const preview = useRenderEmailPreview(
    selectedTemplate,
    selectedLocale ?? undefined,
    previewInput,
    !!selectedTemplate && !!selectedLocale
  )

  const schema = useMemo(
    () => buildVariablesSchema(selectedMeta?.variables ?? []),
    [selectedMeta]
  )
  const editorTheme = useMemo(
    () =>
      EditorView.theme(
        {
          '&': {
            backgroundColor: 'var(--app-code-bg)',
            color: 'var(--app-text)',
          },
          '.cm-content': {
            caretColor: 'var(--app-text)',
          },
          '.cm-gutters': {
            backgroundColor: 'var(--app-code-bg)',
            color: 'var(--app-text-muted)',
            borderRight: '1px solid var(--app-row-border) !important',
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
      <PanelProvider>
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
      </PanelProvider>
    )
  }

  if (templateNames.length === 0) {
    return (
      <PanelProvider>
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
      </PanelProvider>
    )
  }

  if (!selectedTemplate || !selectedMeta || !selectedLocale) {
    return (
      <PanelProvider>
        <EmailsOverview
          templateNames={templateNames}
          templates={templates}
          headerRight={headerRight}
          onSelect={(templateName) => {
            setPreviewInput({})
            setSearchParams({
              template: templateName,
              locale:
                Object.keys(templates[templateName]?.locales ?? {}).sort(
                  (a, b) => a.localeCompare(b)
                )[0] ?? 'en',
            })
          }}
        />
      </PanelProvider>
    )
  }

  const handleTemplateSelect = (templateName: string) => {
    setPreviewInput({})
    setSearchParams({
      template: templateName,
      locale:
        Object.keys(templates[templateName]?.locales ?? {}).sort((a, b) =>
          a.localeCompare(b)
        )[0] ?? 'en',
    })
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
          handleTemplateSelect(value)
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
          setPreviewInput({})
          setSearchParams({ template: selectedTemplate, locale: value })
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
    <PanelProvider>
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
            className={classes.listSurfaceCard}
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
                        border: '1px solid var(--app-row-border)',
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

          {/* Form / render panel */}
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
            <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} p="md">
              <Stack gap="lg">
                <SchemaForm
                  key={`${selectedTemplate}:${selectedLocale}`}
                  schema={schema}
                  submitLabel={m.emails_render_preview()}
                  onSubmit={(formData) => setPreviewInput(formData ?? {})}
                />
                <Divider />
                <Stack gap="xs">
                  <Text fw={600}>{m.emails_template_details()}</Text>
                  <Group gap="xs">
                    <Badge variant="light">
                      {asI18n(`${selectedMeta.variables.length} variables`)}
                    </Badge>
                    <Badge variant="light">
                      {asI18n(
                        `${Object.keys(selectedMeta.locales).length} locales`
                      )}
                    </Badge>
                  </Group>
                  {preview.data?.hash ? (
                    <Code block>{preview.data.hash}</Code>
                  ) : null}
                </Stack>
              </Stack>
            </Box>
          </Box>
        </Box>
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
