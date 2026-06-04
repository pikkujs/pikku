import React, { useEffect, useMemo, useState } from 'react'
import { Allotment } from 'allotment'
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
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { AlertTriangle, Mail, Smartphone, Monitor } from 'lucide-react'
import { useSearchParams } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { SchemaForm } from '../components/ui/SchemaForm'
import { useRenderEmailPreview } from '../hooks/useWirings'
import classes from '../components/ui/console.module.css'

type EmailPreviewValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<unknown>

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

export const EmailsPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  const [searchParams, setSearchParams] = useSearchParams()
  const [previewInput, setPreviewInput] = useState<
    Record<string, EmailPreviewValue>
  >({})

  const templates = meta.emailsMeta.templates || {}
  const templateNames = useMemo(
    () => Object.keys(templates).sort((a, b) => a.localeCompare(b)),
    [templates]
  )

  const selectedTemplate =
    searchParams.get('template') ||
    (templateNames.length > 0 ? templateNames[0] : null)
  const selectedMeta = selectedTemplate ? templates[selectedTemplate] : null
  const localeOptions = useMemo(
    () =>
      Object.keys(selectedMeta?.locales ?? {}).map((locale) => ({
        label: locale,
        value: locale,
      })),
    [selectedMeta]
  )
  const selectedLocale =
    searchParams.get('locale') || localeOptions[0]?.value || 'en'

  useEffect(() => {
    if (!selectedTemplate && templateNames.length === 0) return
    const nextTemplate = selectedTemplate ?? templateNames[0]
    const nextLocale =
      searchParams.get('locale') ||
      Object.keys(templates[nextTemplate]?.locales ?? {})[0] ||
      'en'

    if (
      searchParams.get('template') !== nextTemplate ||
      searchParams.get('locale') !== nextLocale
    ) {
      setSearchParams(
        {
          template: nextTemplate,
          locale: nextLocale,
        },
        { replace: true }
      )
    }
  }, [searchParams, selectedTemplate, setSearchParams, templateNames, templates])

  const preview = useRenderEmailPreview(
    selectedTemplate,
    selectedLocale,
    previewInput,
    !!selectedTemplate
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
      <Center h="100vh">
        <Stack gap={4} align="center">
          <Text fw={600}>No email templates found</Text>
          <Text size="sm" c="dimmed">
            Add an `emailTemplatesDir` and run `pikku emails generate`.
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <Box className={classes.flexColumn} style={{ height: '100vh' }}>
      <Box px="xl" py="lg" style={{ borderBottom: '1px solid var(--app-row-border)' }}>
        <Stack gap={2}>
          <Text size="xl" fw={700}>
            Emails
          </Text>
          <Text size="sm" c="dimmed">
            Browse generated templates, fill variables, and preview desktop and mobile output.
          </Text>
        </Stack>
      </Box>

      <Box className={classes.flexGrow} style={{ minHeight: 0 }}>
        <Allotment defaultSizes={[320, 920]}>
          <Allotment.Pane minSize={280} maxSize={420}>
            <Box className={`${classes.flexColumn} ${classes.overflowHidden}`}>
              <Box className={classes.surfaceCard} m="md" style={{ flex: 1, overflow: 'hidden' }}>
                <Box className={classes.detailHeader}>
                  <Stack gap={2}>
                    <Text fw={600}>Template</Text>
                    <Text size="sm" c="dimmed">
                      Select a template, locale, and variables payload.
                    </Text>
                  </Stack>
                </Box>

                <Box className={classes.flexColumn} style={{ height: 'calc(100% - 68px)' }}>
                  <Box className={classes.overflowAuto}>
                    {templateNames.map((templateName) => {
                      const template = templates[templateName]
                      const isActive = templateName === selectedTemplate
                      return (
                        <UnstyledButton
                          key={templateName}
                          className={classes.listItemPadded}
                          data-active={isActive}
                          onClick={() => {
                            setPreviewInput({})
                            setSearchParams({
                              template: templateName,
                              locale: Object.keys(template.locales)[0] ?? 'en',
                            })
                          }}
                        >
                          <Group justify="space-between" wrap="nowrap" style={{ width: '100%' }}>
                            <Stack gap={2} style={{ minWidth: 0 }}>
                              <Text ff="monospace" fw={600} truncate>
                                {templateName}
                              </Text>
                              <Text size="sm" c="dimmed">
                                {template.variables.length} variable
                                {template.variables.length === 1 ? '' : 's'}
                              </Text>
                            </Stack>
                            <Badge variant="light">{Object.keys(template.locales).length}</Badge>
                          </Group>
                        </UnstyledButton>
                      )
                    })}
                  </Box>

                  <Divider />

                  <Box p="md" className={classes.overflowAuto}>
                    <Stack gap="md">
                      <Select
                        label="Locale"
                        data={localeOptions}
                        value={selectedLocale}
                        onChange={(value) => {
                          if (!value || !selectedTemplate) return
                          setSearchParams({
                            template: selectedTemplate,
                            locale: value,
                          })
                        }}
                        allowDeselect={false}
                      />

                      <SchemaForm
                        key={`${selectedTemplate}:${selectedLocale}`}
                        schema={schema}
                        submitLabel="Render preview"
                        onSubmit={(formData) => setPreviewInput(formData ?? {})}
                      />
                    </Stack>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Allotment.Pane>

          <Allotment.Pane minSize={500}>
            <Box className={`${classes.flexColumn} ${classes.overflowHidden}`}>
              <Box className={classes.surfaceCard} m="md" style={{ flex: 1, overflow: 'hidden' }}>
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

                    <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
                      <Stack gap="xs">
                        <Group gap="xs">
                          <Monitor size={16} />
                          <Text fw={600}>Desktop</Text>
                        </Group>
                        <Box
                          style={{
                            height: 720,
                            border: '1px solid var(--app-row-border)',
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
                      </Stack>

                      <Stack gap="xs">
                        <Group gap="xs">
                          <Smartphone size={16} />
                          <Text fw={600}>Mobile</Text>
                        </Group>
                        <Center>
                          <Box
                            style={{
                              width: 390,
                              maxWidth: '100%',
                              height: 720,
                              border: '1px solid var(--app-row-border)',
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
                        </Center>
                      </Stack>
                    </SimpleGrid>

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
            </Box>
          </Allotment.Pane>
        </Allotment>
      </Box>
    </Box>
  )
}
