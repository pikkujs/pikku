import React, { useState } from 'react'
import {
  Stack,
  Text,
  Box,
  Group,
  Loader,
  Center,
  ActionIcon,
  Badge,
  Divider,
  Paper,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { CodeHighlight } from '@mantine/code-highlight'
import { FunctionSquare, Pencil } from 'lucide-react'
import { useFunctionMeta, useSchema } from '../../../hooks/useWirings'
import { SchemaViewer } from '../../ui/SchemaViewer'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { SidePanel, SidePanelContent, SidePanelHeader } from '../../panel/SidePanel'
import { usePanelContext } from '../../../context/PanelContext'
import { funcWrapperDefs } from '../../ui/badge-defs'
import { CommonDetails } from './shared/CommonDetails'
import { FunctionEditor } from './FunctionEditor'


interface FunctionDetailsFormProps {
  functionName: string
  metadata?: any
}

export const FunctionConfiguration: React.FC<FunctionDetailsFormProps> = ({
  functionName,
  metadata: passedMetadata,
}) => {
  const { data: fetchedMeta, isLoading } = useFunctionMeta(functionName)
  const meta = passedMetadata || fetchedMeta || {}

  if (isLoading && !passedMetadata) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  const services = meta.services?.services || []
  const middleware = meta.middleware || []
  const permissions = meta.permissions || []
  const isExposed = meta.expose === true
  const hasAuth = meta.sessionless !== true

  return (
    <Stack gap="lg">
      <Group gap="xs">
        {funcWrapperDefs[meta.funcWrapper] && (
          <PikkuBadge type="funcWrapper" value={meta.funcWrapper} />
        )}
        {hasAuth && <PikkuBadge type="flag" flag="auth" />}
        {permissions.length > 0 && (
          <PikkuBadge type="flag" flag="permissioned" />
        )}
        {isExposed && <PikkuBadge type="flag" flag="exposed" />}
        {meta.internal === true && <PikkuBadge type="flag" flag="internal" />}
      </Group>

      <CommonDetails
        description={meta.summary || meta.description}
        services={services}
        wires={meta.wires}
        middleware={middleware}
        permissions={permissions}
        tags={meta.tags || []}
        errors={meta.errors || []}
        functionName={functionName}
        inputSchemaName={meta.inputSchemaName}
        outputSchemaName={meta.outputSchemaName}
      />
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
      >
        {canEdit && !editing && (
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setEditing(true)}
            title={m.functions_edit_function()}
            aria-label={m.functions_edit_function()}
          >
            <Pencil size={14} />
          </ActionIcon>
        )}
      </SidePanelHeader>
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
            <FunctionConfiguration functionName={functionName} metadata={passedMetadata} />
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
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  if (error) {
    return <Text c="red">{m.functions_schema_load_error({ message: error.message })}</Text>
  }

  if (!schema) {
    return <Text c="dimmed">{m.functions_schema_not_found({ name: inputSchemaName })}</Text>
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
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  if (error) {
    return <Text c="red">{m.functions_schema_load_error({ message: error.message })}</Text>
  }

  if (!schema) {
    return <Text c="dimmed">{m.functions_schema_not_found({ name: outputSchemaName })}</Text>
  }

  return <SchemaViewer schema={schema} />
}

export const FunctionDetailsForm = FunctionConfiguration
