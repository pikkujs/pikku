import React, { useEffect, useMemo, useState } from 'react'
import { Allotment } from 'allotment'
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
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { AlertTriangle, Mail, Monitor, Search, Smartphone } from 'lucide-react'
import { useSearchParams } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { SchemaForm } from '../components/ui/SchemaForm'
import { useRenderEmailPreview } from '../hooks/useWirings'
import { EmptyState } from '../components/ui/EmptyState'
import { DetailPageHeader } from '../components/layout/DetailPageHeader'
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

const EmailsOverview: React.FC<{
  templateNames: string[]
  templates: Record<string, any>
  onSelect: (templateName: string) => void
}> = ({ templateNames, templates, onSelect }) => {
  const [query, setQuery] = useState('')

  const filteredNames = useMemo(() => {
    if (!query) return templateNames
    const normalized = query.toLowerCase()
    return templateNames.filter((templateName) => {
      const template = templates[templateName]
      return (
        templateName.toLowerCase().includes(normalized) ||
        template.variables.some((variable: string) =>
          variable.toLowerCase().includes(normalized)
        )
      )
    })
  }, [query, templateNames, templates])

  return (
    <Box className={classes.flexColumn} style={{ height: '100vh' }}>
      <DetailPageHeader
        icon={Mail}
        category="Emails"
        docsHref={EMAIL_DOCS_HREF}
      />

      <Box
        px="md"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text size="sm" c="dimmed">
          Browse generated email templates, inspect locale coverage, and open a
          template to render desktop and mobile previews.
        </Text>
      </Box>

      <Box
        px="md"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <TextInput
          placeholder="Search email templates..."
          leftSection={<Search size={16} />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </Box>

      <Box className={classes.flexGrow} style={{ minHeight: 0 }}>
        <Box className={classes.overflowAuto} p="md" h="100%">
          {filteredNames.length === 0 ? (
            <EmptyState message="No email templates match the current search." />
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
              {filteredNames.map((templateName) => {
                const template = templates[templateName]
                const localeCount = Object.keys(template.locales).length
                return (
                  <UnstyledButton
                    key={templateName}
                    onClick={() => onSelect(templateName)}
                    style={{
                      border: '1px solid var(--mantine-color-default-border)',
                      borderRadius: 8,
                      padding: 16,
                      background: 'var(--mantine-color-body)',
                      textAlign: 'start',
                    }}
                  >
                    <Stack gap="sm">
                      <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                      >
                        <Stack gap={4} style={{ minWidth: 0 }}>
                          <Text ff="monospace" fw={600} truncate>
                            {templateName}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {template.variables.length} variable
                            {template.variables.length === 1 ? '' : 's'}
                          </Text>
                        </Stack>
                        <Badge variant="light">{localeCount} locales</Badge>
                      </Group>

                      <Group gap={6}>
                        {Object.keys(template.locales)
                          .slice(0, 3)
                          .map((locale) => (
                            <Badge key={locale} variant="outline" color="gray">
                              {locale}
                            </Badge>
                          ))}
                        {localeCount > 3 ? (
                          <Badge variant="outline" color="gray">
                            +{localeCount - 3}
                          </Badge>
                        ) : null}
                      </Group>

                    </Stack>
                  </UnstyledButton>
                )
              })}
            </SimpleGrid>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export const EmailsPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewInput, setPreviewInput] = useState<
    Record<string, EmailPreviewValue>
  >({})
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(
    'desktop'
  )

  const templates = meta.emailsMeta.templates || {}
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
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (templateNames.length === 0) {
    return (
      <Center h="100vh" px="xl">
        <EmptyState message="No email templates found. Add an `emailTemplatesDir` and run `pikku emails generate`." />
      </Center>
    )
  }

  if (!selectedTemplate || !selectedMeta || !selectedLocale) {
    return (
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
    )
  }

  return (
    <Box className={classes.flexColumn} style={{ height: '100vh' }}>
      <DetailPageHeader
        icon={Mail}
        category="Emails"
        docsHref={EMAIL_DOCS_HREF}
        categoryPath="/emails"
        currentItem={selectedTemplate}
        items={templateItems}
        onItemSelect={(templateName) => {
          setPreviewInput({})
          setSearchParams({
            template: templateName,
            locale:
              Object.keys(templates[templateName].locales)
                .sort((a, b) => a.localeCompare(b))[0] ?? 'en',
          })
        }}
        rightSection={
          <Group gap="sm" wrap="nowrap">
            <Select
              data={localeOptions}
              value={selectedLocale}
              onChange={(value) => {
                if (!value) return
                setPreviewInput({})
                setSearchParams({
                  template: selectedTemplate,
                  locale: value,
                })
              }}
              allowDeselect={false}
              size="xs"
              w={96}
            />
            <SegmentedControl
              value={previewMode}
              onChange={(value) =>
                setPreviewMode(value as 'desktop' | 'mobile')
              }
              size="xs"
              data={[
                {
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <Monitor size={14} />
                      <span>Desktop</span>
                    </Group>
                  ),
                  value: 'desktop',
                },
                {
                  label: (
                    <Group gap={6} wrap="nowrap">
                      <Smartphone size={14} />
                      <span>Mobile</span>
                    </Group>
                  ),
                  value: 'mobile',
                },
              ]}
            />
          </Group>
        }
      />

      <Box
        px="md"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text size="sm" c="dimmed">
          Render a template with sample variables and inspect its desktop or
          mobile presentation before sending.
        </Text>
      </Box>

      <Box className={classes.flexGrow} style={{ minHeight: 0 }}>
        <Allotment defaultSizes={[760, 340]}>
          <Allotment.Pane minSize={480}>
            <Box className={classes.flexColumn} h="100%">
              <Box className={classes.detailHeader}>
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <Mail size={16} />
                    <Text fw={600} ff="monospace">
                      {selectedTemplate}
                    </Text>
                    <Badge variant="light">{selectedLocale}</Badge>
                    {preview.data?.hash ? (
                      <Badge variant="outline" color="gray">
                        {preview.data.hash.slice(0, 10)}
                      </Badge>
                    ) : null}
                  </Group>
                  <Text size="sm" c="dimmed" truncate>
                    {preview.data?.subject || 'No subject rendered yet'}
                  </Text>
                </Stack>
              </Box>

              <Box className={classes.overflowAuto} p="md">
                <Stack gap="md">
                  {preview.isLoading ? (
                    <Center py="xl">
                      <Loader />
                    </Center>
                  ) : null}

                  {preview.error ? (
                    <Alert color="red" icon={<AlertTriangle size={16} />}>
                      {preview.error instanceof Error
                        ? preview.error.message
                        : 'Failed to render email preview'}
                    </Alert>
                  ) : null}

                  {preview.data?.missing?.length ? (
                    <Alert color="yellow" icon={<AlertTriangle size={16} />}>
                      Missing source files: {preview.data.missing.join(', ')}
                    </Alert>
                  ) : null}

                  <Center py="sm">
                    {previewMode === 'desktop' ? (
                      <Box
                        style={{
                          width: '100%',
                          maxWidth: 960,
                          height: 720,
                          border: '1px solid var(--mantine-color-default-border)',
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
                          border: '1px solid var(--mantine-color-default-border)',
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
          </Allotment.Pane>

          <Allotment.Pane minSize={280} preferredSize={340} maxSize={420}>
            <Box
              className={classes.flexColumn}
              h="100%"
              style={{
                borderLeft: '1px solid var(--mantine-color-default-border)',
              }}
            >
              <Box className={classes.detailHeader}>
                <Stack gap={2}>
                  <Text fw={600}>Render</Text>
                  <Text size="sm" c="dimmed">
                    Supply variables and render the selected template.
                  </Text>
                </Stack>
              </Box>

              <Box className={classes.overflowAuto} p="md">
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
                      <Badge variant="light">
                        {selectedMeta.variables.length} variables
                      </Badge>
                      <Badge variant="light">
                        {Object.keys(selectedMeta.locales).length} locales
                      </Badge>
                    </Group>
                    {preview.data?.hash ? (
                      <Code block>{preview.data.hash}</Code>
                    ) : null}
                  </Stack>
                </Stack>
              </Box>
            </Box>
          </Allotment.Pane>
        </Allotment>
      </Box>
    </Box>
  )
}
