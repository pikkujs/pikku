import React, { useEffect, useMemo, useState } from 'react'
import type { RJSFSchema } from '@rjsf/utils'
import {
  Alert,
  Badge,
  Box,
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
} from '@mantine/core'
import { AlertTriangle, Mail, Monitor, Search, Smartphone, ChevronDown, Check } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { useSearchParams } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { SchemaForm } from '../components/ui/SchemaForm'
import { useRenderEmailPreview } from '../hooks/useWirings'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
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

type EmailTemplateItem = {
  name: string
  variables: string[]
  locales: Record<string, unknown>
}

const emailColumns = [
  {
    key: 'name',
    header: 'NAME',
    render: (item: EmailTemplateItem) => (
      <Text fw={500} ff="monospace" truncate>
        {item.name}
      </Text>
    ),
  },
  {
    key: 'variables',
    header: 'VARIABLES',
    width: 120,
    render: (item: EmailTemplateItem) => (
      <Text size="sm" c="dimmed">
        {item.variables.length}
      </Text>
    ),
  },
  {
    key: 'locales',
    header: 'LOCALES',
    width: 280,
    render: (item: EmailTemplateItem) => {
      const localeKeys = Object.keys(item.locales)
      return (
        <Group gap={4}>
          {localeKeys.slice(0, 5).map((locale) => (
            <Badge key={locale} variant="outline" color="gray" size="sm">
              {locale}
            </Badge>
          ))}
          {localeKeys.length > 5 && (
            <Badge variant="outline" color="gray" size="sm">
              +{localeKeys.length - 5}
            </Badge>
          )}
        </Group>
      )
    },
  },
]

const EmailsOverview: React.FC<{
  templateNames: string[]
  templates: Record<string, any>
  onSelect: (templateName: string) => void
}> = ({ templateNames, templates, onSelect }) => {
  const data = useMemo<EmailTemplateItem[]>(
    () => templateNames.map((name) => ({ name, ...templates[name] })),
    [templateNames, templates]
  )

  return (
    <TableListPage
      icon={Mail}
      title="Email Templates"
      docsHref={EMAIL_DOCS_HREF}
      data={data}
      columns={emailColumns}
      getKey={(item) => item.name}
      onRowClick={(item) => onSelect(item.name)}
      searchPlaceholder="Search email templates..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.variables.some((v) => v.toLowerCase().includes(q))
      }
      emptyMessage="No email templates match the current search."
    />
  )
}

export const EmailsPage: React.FC<{ hero?: React.ReactNode; headerRight?: React.ReactNode }> = ({ hero, headerRight }) => {
  const { meta, loading } = usePikkuMeta()
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewInput, setPreviewInput] = useState<
    Record<string, EmailPreviewValue>
  >({})
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(
    'desktop'
  )
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectorSearch, setSelectorSearch] = useState('')

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

  if (loading) {
    return (
      <PanelProvider>
        <ResizablePanelLayout hidePanel header={<ListPageHeader title="Email Templates" description="Preview and inspect email templates with live variable rendering" lead={headerRight} />}>
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
        <ResizablePanelLayout hidePanel header={<ListPageHeader title="Email Templates" description="Preview and inspect email templates with live variable rendering" lead={headerRight} />}>
          <EmptyStatePlaceholder
            icon={Mail}
            hero={hero}
            title="No email templates found"
            description="Add an email templates directory to your project, then run:"
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
        <ResizablePanelLayout
          hidePanel
          header={<ListPageHeader title="Email Templates" description="Preview and inspect email templates with live variable rendering" lead={headerRight} />}
        >
          <EmailsOverview
            templateNames={templateNames}
            templates={templates}
            onSelect={(templateName) => {
              setPreviewInput({})
              setSearchParams({
                template: templateName,
                locale:
                  Object.keys(templates[templateName].locales)
                    .sort((a, b) => a.localeCompare(b))[0] ?? 'en',
              })
            }}
          />
        </ResizablePanelLayout>
      </PanelProvider>
    )
  }

  const filteredTemplateItems = useMemo(() => {
    if (!selectorSearch) return templateItems
    const q = selectorSearch.toLowerCase()
    return templateItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    )
  }, [templateItems, selectorSearch])

  const handleTemplateSelect = (templateName: string) => {
    setSelectorOpen(false)
    setSelectorSearch('')
    setPreviewInput({})
    setSearchParams({
      template: templateName,
      locale: Object.keys(templates[templateName].locales).sort((a, b) => a.localeCompare(b))[0] ?? 'en',
    })
  }

  return (
    <Box
      className={classes.flexColumn}
      style={{
        height: '100vh',
        padding: 'var(--mantine-spacing-xl)',
        gap: 'var(--mantine-spacing-md)',
      }}
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
          style={{ flex: 1, minWidth: 480, display: 'flex', flexDirection: 'column' }}
        >
          <Box
            px="md"
            py="xs"
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
          >
            <Group gap="sm" justify="space-between" wrap="nowrap">
              <Group gap="xs" style={{ minWidth: 0 }}>
                <Mail size={16} />
                <Text fw={600} ff="monospace" truncate>{selectedTemplate}</Text>
                {preview.data?.hash ? (
                  <Badge variant="outline" color="gray" style={{ flexShrink: 0 }}>
                    {preview.data.hash.slice(0, 10)}
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
                  onChange={(value) => setPreviewMode(value as 'desktop' | 'mobile')}
                  size="xs"
                  data={[
                    { label: <Group gap={4} wrap="nowrap"><Monitor size={14} /><span>Desktop</span></Group>, value: 'desktop' },
                    { label: <Group gap={4} wrap="nowrap"><Smartphone size={14} /><span>Mobile</span></Group>, value: 'mobile' },
                  ]}
                />
              </Group>
            </Group>
            {preview.data?.subject && (
              <Text size="sm" c="dimmed" truncate mt={4}>{preview.data.subject}</Text>
            )}
          </Box>

          <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} p="md">
            <Stack gap="md">
              {preview.isLoading ? <Center py="xl"><Loader /></Center> : null}
              {preview.error ? (
                <Alert color="red" icon={<AlertTriangle size={16} />}>
                  {preview.error instanceof Error ? preview.error.message : 'Failed to render email preview'}
                </Alert>
              ) : null}
              {preview.data?.missing?.length ? (
                <Alert color="yellow" icon={<AlertTriangle size={16} />}>
                  Missing source files: {preview.data.missing.join(', ')}
                </Alert>
              ) : null}
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
              {preview.data?.text ? (
                <>
                  <Divider />
                  <Stack gap="xs">
                    <Text fw={600}>Text fallback</Text>
                    <Code block>{preview.data.text}</Code>
                  </Stack>
                </>
              ) : null}
            </Stack>
          </Box>
        </Box>

        {/* Form / render panel */}
        <Box
          className={classes.listSurfaceCard}
          style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
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
                  {selectedTemplate}
                </Text>
                <ChevronDown size={14} style={{ flexShrink: 0 }} />
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              <TextInput
                placeholder="Search templates..."
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
                        <Text size="sm" fw={item.name === selectedTemplate ? 500 : 400}>{item.name}</Text>
                        {item.description && <Text size="sm" c="dimmed">{item.description}</Text>}
                      </div>
                    </UnstyledButton>
                  ))}
                  {filteredTemplateItems.length === 0 && <Text size="sm" c="dimmed" ta="center" py="md">No results</Text>}
                </Stack>
              </ScrollArea.Autosize>
            </Popover.Dropdown>
          </Popover>

          <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} p="md">
            <Stack gap="lg">
              <SchemaForm
                key={`${selectedTemplate}:${selectedLocale}`}
                schema={schema}
                submitLabel="Render preview"
                onSubmit={(formData) => setPreviewInput(formData ?? {})}
              />
              <Divider />
              <Stack gap="xs">
                <Text fw={600}>Template details</Text>
                <Group gap="xs">
                  <Badge variant="light">{selectedMeta.variables.length} variables</Badge>
                  <Badge variant="light">{Object.keys(selectedMeta.locales).length} locales</Badge>
                </Group>
                {preview.data?.hash ? <Code block>{preview.data.hash}</Code> : null}
              </Stack>
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
