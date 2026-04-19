import React, { useState } from 'react'
import {
  Stack,
  Text,
  Box,
  Group,
  Loader,
  Center,
  ActionIcon,
} from '@mantine/core'
import { CodeHighlight } from '@mantine/code-highlight'
import { FunctionSquare, Pencil } from 'lucide-react'
import { useFunctionMeta, useSchema } from '../../../hooks/useWirings'
import { SchemaViewer } from '../../ui/SchemaViewer'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { funcWrapperDefs } from '../../ui/badge-defs'
import { CommonDetails } from './shared/CommonDetails'
import { FunctionEditor } from './FunctionEditor'

interface FunctionDetailsFormProps {
  functionName: string
  metadata?: any
}

export const FunctionConfiguration: React.FunctionComponent<
  FunctionDetailsFormProps
> = ({ functionName, metadata: passedMetadata }) => {
  const { data: fetchedMeta, isLoading } = useFunctionMeta(functionName)
  const meta = passedMetadata || fetchedMeta || {}
  const [editing, setEditing] = useState(false)

  if (isLoading && !passedMetadata) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  const canEdit = !!meta.sourceFile && !!meta.exportedName

  if (editing && canEdit) {
    return (
      <FunctionEditor
        functionName={functionName}
        sourceFile={meta.sourceFile}
        exportedName={meta.exportedName}
        onClose={() => setEditing(false)}
      />
    )
  }

  const services = meta.services?.services || []
  const middleware = meta.middleware || []
  const permissions = meta.permissions || []
  const isExposed = meta.expose === true
  const hasAuth = meta.sessionless !== true

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <FunctionSquare size={20} />
            <Text size="lg" ff="monospace" fw={600}>
              {functionName}
            </Text>
          </Group>
          {canEdit && (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setEditing(true)}
              title="Edit function"
            >
              <Pencil size={14} />
            </ActionIcon>
          )}
        </Group>
        {meta.summary && (
          <Text size="sm" c="dimmed" mt={4}>
            {meta.summary}
          </Text>
        )}
      </Box>

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
        description={meta.description}
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

export const FunctionCode: React.FunctionComponent<
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

export const FunctionInput: React.FunctionComponent<
  FunctionDetailsFormProps
> = ({ functionName, metadata = {} }) => {
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = metadata?.inputSchemaName ? metadata : fetchedMeta || {}
  const inputSchemaName = meta?.inputSchemaName
  const { data: schema, isLoading, error } = useSchema(inputSchemaName)

  if (!inputSchemaName) {
    return <Text c="dimmed">No input schema defined</Text>
  }

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  if (error) {
    return <Text c="red">Error loading schema: {error.message}</Text>
  }

  if (!schema) {
    return <Text c="dimmed">Schema not found: {inputSchemaName}</Text>
  }

  return <SchemaViewer schema={schema} />
}

export const FunctionOutput: React.FunctionComponent<
  FunctionDetailsFormProps
> = ({ functionName, metadata = {} }) => {
  const { data: fetchedMeta } = useFunctionMeta(functionName)
  const meta = metadata?.outputSchemaName ? metadata : fetchedMeta || {}
  const outputSchemaName = meta?.outputSchemaName
  const { data: schema, isLoading, error } = useSchema(outputSchemaName)

  if (!outputSchemaName) {
    return <Text c="dimmed">No output schema defined</Text>
  }

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    )
  }

  if (error) {
    return <Text c="red">Error loading schema: {error.message}</Text>
  }

  if (!schema) {
    return <Text c="dimmed">Schema not found: {outputSchemaName}</Text>
  }

  return <SchemaViewer schema={schema} />
}

export const FunctionDetailsForm = FunctionConfiguration
