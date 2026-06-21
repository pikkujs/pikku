import React, { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@pikku/react/i18n'
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
  Popover,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  ScrollArea,
} from '@pikku/mantine/core'
import { AlertTriangle, Mail, Monitor, Search, Smartphone, ChevronDown, Check, Code2, Save, FileText } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { useSearchParams } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { SchemaForm } from '../components/ui/SchemaForm'
import { useRenderEmailPreview } from '../hooks/useWirings'
import { useUpdateEmailTemplate } from '../hooks/useCodeEdit'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
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

export const EmailsPage: React.FC<{ hero?: React.ReactNode; headerRight?: React.ReactNode }> = ({ hero, headerRight }) => {
  const { t } = useI18n()
  const { meta, loading } = usePikkuMeta()
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewInput, setPreviewInput] = useState<
    Record<string, EmailPreviewValue>
  >({})
  const [previewMode, setPreviewMode] = useState<
    'desktop' | 'mobile' | 'html' | 'text'
  >('desktop')
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectorSearch, setSelectorSearch] = useState('')
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
        name: templateName,
        description: `${templates[templateName].variables.length} variable${
          templates[templateName].variables.length === 1 ? '' : 's'
        }`,
      })),
    [templateNames, templates]
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

  // Sync the editor to the raw template source whenever it (re)loads — including
  // after a successful save, when the invalidated preview refetches the new source.
  const templateSource = preview.data?.source ?? ''
  useEffect(() => {
    setEditorValue(templateSource)
  }, [templateSource, selectedTemplate])

  const updateEmailTemplate = useUpdateEmailTemplate()
  const sourceDirty = editorValue !== templateSource

  const filteredTemplateItems = useMemo(() => {
    if (!selectorSearch) return templateItems
    const q = selectorSearch.toLowerCase()
    return templateItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    )
  }, [templateItems, selectorSearch])

  if (loading) {
    return (
      <PanelProvider>
        <ResizablePanelLayout hidePanel header={<ListPageHeader title={t('emails.title')} description={t('emails.description')} />}>
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
        <ResizablePanelLayout hidePanel header={<ListPageHeader title={t('emails.title')} description={t('emails.description')} />}>
          <EmptyStatePlaceholder
            icon={Mail}
            hero={hero}
            title={t('emails.no_templates_title')}
            description={t('emails.no_templates_description')}
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
                Object.keys(templates[templateName]?.locales ?? {})
                  .sort((a, b) => a.localeCompare(b))[0] ?? 'en',
            })
          }}
        />
      </PanelProvider>
    )
  }

  const handleTemplateSelect = (templateName: string) => {
    setSelectorOpen(false)
    setSelectorSearch('')
    setPreviewInput({})
    setSearchParams({
      template: templateName,
      locale: Object.keys(templates[templateName]?.locales ?? {}).sort((a, b) => a.localeCompare(b))[0] ?? 'en',
    })
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title={t('emails.title')}
            description={t('emails.description')}
            lead={headerRight}
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
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
        >
          <Box
            px="md"
            py="xs"
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
          >
            <Group gap="sm" justify="space-between" wrap="nowrap">
              <Group gap="xs" style={{ minWidth: 0 }}>
                <Mail size={16} />
                <Text fw={600} truncate>{asI18n(humanizeTemplateName(selectedTemplate))}</Text>
                {preview.data?.hash ? (
                  <Badge variant="outline" color="gray" style={{ flexShrink: 0 }}>
                    {asI18n(preview.data.hash.slice(0, 10))}
                  </Badge>
                ) : null}
              </Group>
              <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
                <Select
                  data={localeOptions}
                  value={selectedLocale}
                  onChange={(value) => {
                    if (!value) return
                    setPreviewInput({})
                    setSearchParams({ template: selectedTemplate, locale: value })
                  }}
                  allowDeselect={false}
                  size="xs"
                  w={96}
                />
                <SegmentedControl
                  value={previewMode}
                  onChange={(value) => setPreviewMode(value as 'desktop' | 'mobile' | 'html' | 'text')}
                  size="xs"
                  data={[
                    { label: <Group gap={4} wrap="nowrap"><Monitor size={14} /><span>Desktop</span></Group>, value: 'desktop' },
                    { label: <Group gap={4} wrap="nowrap"><Smartphone size={14} /><span>Mobile</span></Group>, value: 'mobile' },
                    { label: <Group gap={4} wrap="nowrap"><FileText size={14} /><span>Text</span></Group>, value: 'text' },
                    { label: <Group gap={4} wrap="nowrap"><Code2 size={14} /><span>HTML</span></Group>, value: 'html' },
                  ]}
                />
              </Group>
            </Group>
            {preview.data?.subject && (
              <Text size="sm" c="dimmed" truncate mt={4}>{asI18n(preview.data.subject)}</Text>
            )}
          </Box>

          <Box style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' }} p="md">
            <Stack gap="md" style={{ minWidth: 0 }}>
              {preview.isLoading ? <Center py="xl"><Loader /></Center> : null}
              {preview.error ? (
                <Alert color="red" icon={<AlertTriangle size={16} />}>
                  {asI18n(preview.error instanceof Error ? preview.error.message : 'Failed to render email preview')}
                </Alert>
              ) : null}
              {preview.data?.missing?.length ? (
                <Alert color="yellow" icon={<AlertTriangle size={16} />}>
                  {asI18n(`Missing source files: ${preview.data.missing.join(', ')}`)}
                </Alert>
              ) : null}
              {previewMode === 'html' ? (
                <Stack gap="sm" style={{ minWidth: 0 }}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" c="dimmed">
                      {t('emails.editing_template_prefix')}<Code>templates/{selectedTemplate}.html</Code>{t('emails.editing_template_suffix')}
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
                      {t('common.save')}
                    </Button>
                  </Group>
                  {updateEmailTemplate.isError ? (
                    <Alert color="red" icon={<AlertTriangle size={16} />}>
                      {asI18n(updateEmailTemplate.error instanceof Error
                        ? updateEmailTemplate.error.message
                        : 'Failed to save email template')}
                    </Alert>
                  ) : null}
                  <Box style={{ border: '1px solid var(--app-row-border)', borderRadius: 8, overflow: 'hidden', width: '100%', minWidth: 0 }}>
                    <CodeMirror
                      value={editorValue}
                      width="100%"
                      height="600px"
                      onChange={(value) => setEditorValue(value)}
                    />
                  </Box>
                </Stack>
              ) : previewMode === 'text' ? (
                preview.data?.text ? (
                  <Code block>{preview.data.text}</Code>
                ) : (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    {t('emails.no_text_version')}
                  </Text>
                )
              ) : (
                <Center py="sm">
                  {previewMode === 'desktop' ? (
                    <Box style={{ width: '100%', maxWidth: 960, height: 720, border: '1px solid var(--app-row-border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                      <iframe title="Desktop email preview" srcDoc={preview.data?.html ?? ''} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
                    </Box>
                  ) : (
                    <Box style={{ width: 390, maxWidth: '100%', height: 720, border: '1px solid var(--app-row-border)', borderRadius: 24, overflow: 'hidden', background: '#fff' }}>
                      <iframe title="Mobile email preview" srcDoc={preview.data?.html ?? ''} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
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
          style={{ width: 300, maxWidth: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
        >
          {/* Template selector */}
          <Popover opened={selectorOpen} onChange={setSelectorOpen} width={280} position="bottom-start" shadow="md" zIndex={10000}>
            <Popover.Target>
              <UnstyledButton
                px="sm"
                py="xs"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--mantine-color-default-border)' }}
                onClick={() => setSelectorOpen((o) => !o)}
              >
                <Text size="sm" fw={600} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asI18n(selectedTemplate)}
                </Text>
                <ChevronDown size={14} style={{ flexShrink: 0 }} />
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              <TextInput
                placeholder={t('emails.search_templates')}
                leftSection={<Search size={14} />}
                value={selectorSearch}
                onChange={(e) => setSelectorSearch(e.currentTarget.value)}
                styles={{ input: { border: 'none', borderBottom: '1px solid var(--mantine-color-default-border)', borderRadius: 0 } }}
              />
              <ScrollArea.Autosize mah={300}>
                <Stack gap={0}>
                  {filteredTemplateItems.map((item) => (
                    <UnstyledButton
                      key={item.name}
                      onClick={() => handleTemplateSelect(item.name)}
                      py="xs"
                      px="sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: item.name === selectedTemplate ? 'var(--mantine-color-green-light)' : undefined }}
                    >
                      {item.name === selectedTemplate ? <Check size={14} color="var(--mantine-color-green-6)" /> : <Box w={14} />}
                      <div>
                        <Text size="sm" fw={item.name === selectedTemplate ? 500 : 400}>{asI18n(item.name)}</Text>
                        {item.description && <Text size="sm" c="dimmed">{asI18n(item.description)}</Text>}
                      </div>
                    </UnstyledButton>
                  ))}
                  {filteredTemplateItems.length === 0 && <Text size="sm" c="dimmed" ta="center" py="md">{t('common.no_results')}</Text>}
                </Stack>
              </ScrollArea.Autosize>
            </Popover.Dropdown>
          </Popover>

          <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} p="md">
            <Stack gap="lg">
              <SchemaForm
                key={`${selectedTemplate}:${selectedLocale}`}
                schema={schema}
                submitLabel={t('emails.render_preview')}
                onSubmit={(formData) => setPreviewInput(formData ?? {})}
              />
              <Divider />
              <Stack gap="xs">
                <Text fw={600}>{t('emails.template_details')}</Text>
                <Group gap="xs">
                  <Badge variant="light">{asI18n(`${selectedMeta.variables.length} variables`)}</Badge>
                  <Badge variant="light">{asI18n(`${Object.keys(selectedMeta.locales).length} locales`)}</Badge>
                </Group>
                {preview.data?.hash ? <Code block>{preview.data.hash}</Code> : null}
              </Stack>
            </Stack>
          </Box>
        </Box>
        </Box>
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
