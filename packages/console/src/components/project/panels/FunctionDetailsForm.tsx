import React, { useState } from 'react'
import {
  Stack,
  Text,
  Box,
  Group,
  Button,
  ThemeIcon
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { CodeHighlight } from '@mantine/code-highlight'
import '../../ui/code-highlight-styles'
import {
  Bot,
  Clock,
  Cpu,
  FunctionSquare,
  Globe,
  ListOrdered,
  MonitorSmartphone,
  Network,
  Pencil,
  Radio,
  Terminal,
  Zap,
} from 'lucide-react'
import { useFunctionMeta, useSchema } from '../../../hooks/useWirings'
import { SchemaViewer } from '../../ui/SchemaViewer'
import { CardRow } from '../../ui/CardRow'
import { DevField, DevFields, devSourcePath } from '../../ui/DevDetail'
import { ForDevelopers } from '../../ui/ForDevelopers'
import { StatusBadge } from '../../ui/StatusBadge'
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
} from '../../panel/SidePanel'
import { usePanelContext } from '../../../context/PanelContext'
import { usePikkuMeta } from '../../../context/PikkuMetaContext'
import { useLink } from '../../../router'
import {
  REACH_HREF,
  kindLabel,
  kindOf,
  reachLabel,
} from '../../functions/functionLabels'
import type { FunctionTestData } from '../../functions/FunctionsListPanel'
import { CommonDetails } from './shared/CommonDetails'
import { FunctionEditor } from './FunctionEditor'
import { ConsoleLoading } from '../../ui/ConsoleLoading'

const PanelHeading: React.FC<{ children: I18nNode }> = ({ children }) => (
  <Text size="sm" fw={600}>
    {children}
  </Text>
)

interface FunctionDetailsFormProps {
  functionName: string
  metadata?: any
}

const REACH_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  app: MonitorSmartphone,
  http: Globe,
  cli: Terminal,
  mcp: Cpu,
  channel: Radio,
  gateway: Network,
  scheduler: Clock,
  queue: ListOrdered,
  trigger: Zap,
  agent: Bot,
}

const ReachRow: React.FC<{
  type: string
  name?: string
}> = ({ type, name }) => {
  const Link = useLink()
  const Icon = REACH_ICON[type] ?? Network
  const href = REACH_HREF[type]
  const row = (
    <CardRow
      leading={
        <ThemeIcon variant="light" color="gray" size={30} radius="md">
          <Icon size={15} />
        </ThemeIcon>
      }
      title={
        name ? (
          <Text span ff="monospace" fz="sm" fw={600}>
            {asI18n(name)}
          </Text>
        ) : (
          reachLabel(type)
        )
      }
      meta={name ? reachLabel(type) : m.functions_panel_reach_app_meta()}
    />
  )
  return href ? (
    <Box component={Link} to={href} td="none" c="inherit">
      {row}
    </Box>
  ) : (
    row
  )
}

const SchemaBlock: React.FC<{
  label: I18nNode
  schemaName?: string | null
  empty: I18nNode
}> = ({ label, schemaName, empty }) => {
  const { data: schema, isLoading } = useSchema(schemaName)
  return (
    <Stack gap={6}>
      <PanelHeading>{label}</PanelHeading>
      {!schemaName ? (
        <Text size="sm" c="dimmed">
          {empty}
        </Text>
      ) : isLoading ? (
        <ConsoleLoading py="md" />
      ) : (
        <SchemaViewer schema={schema} />
      )}
    </Stack>
  )
}

export const FunctionConfiguration: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata: passedMetadata,
}) => {
  useLocale()
  const { data: fetchedMeta, isLoading } = useFunctionMeta(functionName)
  const { functionUsedBy } = usePikkuMeta()
  const meta = passedMetadata || fetchedMeta || {}

  if (isLoading && !passedMetadata) {
    return (
      <ConsoleLoading py="xl" />
    )
  }

  const permissions = meta.permissions || []
  const usedBy = functionUsedBy.get(functionName)
  const wirings: { type: string; id: string; name: string }[] = usedBy
    ? [...usedBy.transports, ...usedBy.jobs]
    : []
  const tests = meta.tests as FunctionTestData | undefined
  const description = meta.summary || meta.description

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Group gap="xs">
          {meta.sessionless === true ? (
            <StatusBadge tone="neutral" size="lg">
              {m.functions_panel_anyone()}
            </StatusBadge>
          ) : (
            <StatusBadge tone="info" size="lg">
              {m.functions_panel_signed_in_only()}
            </StatusBadge>
          )}
          {permissions.length > 0 && (
            <StatusBadge tone="warn" size="lg">
              {m.functions_panel_needs_permission()}
            </StatusBadge>
          )}
          <Text size="xs" c="dimmed">
            {kindLabel(kindOf(meta))}
          </Text>
        </Group>
        {description && (
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {asI18n(description)}
          </Text>
        )}
      </Stack>

      <Stack gap={6}>
        <PanelHeading>{m.functions_panel_reach_title()}</PanelHeading>
        {!meta.expose && wirings.length === 0 ? (
          <Text size="sm" c="dimmed">
            {m.functions_panel_reach_none()}
          </Text>
        ) : (
          <>
            {meta.expose && <ReachRow type="app" />}
            {wirings.map((w) => (
              <ReachRow key={w.id} type={w.type} name={w.name} />
            ))}
          </>
        )}
      </Stack>

      {tests && (
        <Stack gap={6}>
          <PanelHeading>{m.functions_panel_tests_title()}</PanelHeading>
          <Group gap="sm">
            <StatusBadge
              tone={
                tests.status === 'covered'
                  ? 'good'
                  : tests.status === 'partial'
                    ? 'warn'
                    : tests.status === 'uncovered'
                      ? 'bad'
                      : 'neutral'
              }
              size="lg"
            >
              {tests.status === 'covered'
                ? m.functions_panel_tests_covered()
                : tests.status === 'unknown'
                  ? m.functions_tests_none()
                  : asI18n(`${Math.round(tests.ratio * 100)}%`)}
            </StatusBadge>
            <Text size="sm" c="dimmed">
              {m.functions_panel_tests_scenarios({
                count: tests.scenarios.length,
              })}
            </Text>
          </Group>
        </Stack>
      )}

      <SchemaBlock
        label={m.functions_panel_takes()}
        schemaName={meta.inputSchemaName}
        empty={m.functions_panel_takes_nothing()}
      />
      <SchemaBlock
        label={m.functions_panel_gives()}
        schemaName={meta.outputSchemaName}
        empty={m.functions_panel_gives_nothing()}
      />

      <ForDevelopers
        label={m.functions_panel_dev_label()}
        testId="function-dev"
      >
        <Stack gap="md">
          <DevFields>
            <DevField label={m.dev_function()} value={functionName} />
            {meta.exportedName && meta.exportedName !== functionName && (
              <DevField label={m.dev_export()} value={meta.exportedName} />
            )}
            {meta.sourceFile && (
              <DevField
                label={m.dev_source()}
                value={devSourcePath(meta.sourceFile)}
              />
            )}
            {meta.funcWrapper && (
              <DevField label={m.dev_wrapper()} value={meta.funcWrapper} />
            )}
          </DevFields>
          <CommonDetails
            services={meta.services?.services || []}
            wires={meta.wires}
            middleware={meta.middleware || []}
            permissions={permissions}
            tags={meta.tags || []}
            errors={meta.errors || []}
          />
        </Stack>
      </ForDevelopers>
    </Stack>
  )
}

export const FunctionHeader: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata: passedMetadata,
}) => {
  useLocale()
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = passedMetadata || fetchedMeta || {}

  return (
    <Box>
      <Group gap="xs">
        <FunctionSquare size={20} />
        <Text size="lg" ff="monospace" fw={600}>
          {asI18n(functionName)}
        </Text>
      </Group>
      <Text size="sm" c="dimmed" mt={4}>
        {meta.summary ? asI18n(meta.summary) : m.functions_no_summary()}
      </Text>
    </Box>
  )
}

export const FunctionTabbedPanel: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata: passedMetadata,
}) => {
  useLocale()
  const [editing, setEditing] = useState(false)
  const { activePanel, panels, closePanel, goBack } = usePanelContext()
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = passedMetadata || fetchedMeta || {}
  const canEdit = !!meta.sourceFile && !!meta.exportedName
  const panelData = activePanel ? panels.get(activePanel) : null

  return (
    <SidePanel>
      <SidePanelHeader
        title={asI18n(panelData?.title ?? functionName)}
        onBack={panelData && panelData.history.length > 0 ? goBack : undefined}
        onClose={() => activePanel && closePanel(activePanel)}
      />
      <SidePanelContent>
        <Box px="md">
          {editing && canEdit ? (
            <FunctionEditor
              functionName={functionName}
              sourceFile={meta.sourceFile}
              exportedName={meta.exportedName}
              onClose={() => setEditing(false)}
            />
          ) : (
            <Stack gap="lg" pb="md">
              <FunctionConfiguration
                functionName={functionName}
                metadata={passedMetadata}
              />
              {canEdit && (
                <Button
                  variant="default"
                  fullWidth
                  leftSection={<Pencil size={14} />}
                  onClick={() => setEditing(true)}
                >
                  {m.functions_panel_edit_in_code()}
                </Button>
              )}
            </Stack>
          )}
        </Box>
      </SidePanelContent>
    </SidePanel>
  )
}

export const FunctionCode: React.FC<
  Pick<FunctionDetailsFormProps, 'functionName'>
> = ({ functionName }) => {
  const exampleCode = `export const ${functionName} = pikkuFunc({
  handler: async (input, { services, session }) => {
    // Function implementation
    return {}
  }
})`

  return <CodeHighlight code={exampleCode} language="typescript" />
}

export const FunctionInput: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata = {},
}) => {
  useLocale()
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = metadata?.inputSchemaName ? metadata : fetchedMeta || {}
  const inputSchemaName = meta?.inputSchemaName
  const { data: schema, isLoading, error } = useSchema(inputSchemaName)

  if (!inputSchemaName) {
    return <Text c="dimmed">{m.functions_no_input_schema()}</Text>
  }

  if (isLoading) {
    return (
      <ConsoleLoading py="xl" />
    )
  }

  if (error) {
    return (
      <Text c="red">
        {m.functions_schema_load_error({ message: error.message })}
      </Text>
    )
  }

  if (!schema) {
    return (
      <Text c="dimmed">
        {m.functions_schema_not_found({ name: inputSchemaName })}
      </Text>
    )
  }

  return <SchemaViewer schema={schema} />
}

export const FunctionOutput: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata = {},
}) => {
  useLocale()
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = metadata?.outputSchemaName ? metadata : fetchedMeta || {}
  const outputSchemaName = meta?.outputSchemaName
  const { data: schema, isLoading, error } = useSchema(outputSchemaName)

  if (!outputSchemaName) {
    return <Text c="dimmed">{m.functions_no_output_schema()}</Text>
  }

  if (isLoading) {
    return (
      <ConsoleLoading py="xl" />
    )
  }

  if (error) {
    return (
      <Text c="red">
        {m.functions_schema_load_error({ message: error.message })}
      </Text>
    )
  }

  if (!schema) {
    return (
      <Text c="dimmed">
        {m.functions_schema_not_found({ name: outputSchemaName })}
      </Text>
    )
  }

  return <SchemaViewer schema={schema} />
}
