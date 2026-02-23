import React from 'react'
import { Stack, Text, Box, Code, Group, Loader, Center } from '@mantine/core'
import { FunctionSquare } from 'lucide-react'
import { useFunctionMeta, useSchema } from '@/hooks/useWirings'
import { SchemaViewer } from '@/components/ui/SchemaViewer'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { funcWrapperDefs } from '@/components/ui/badge-defs'
import { CommonDetails } from '@/components/project/panels/shared/CommonDetails'

interface FunctionDetailsFormProps {
  functionName: string
  metadata?: any
}

export const FunctionConfiguration: React.FunctionComponent<
  FunctionDetailsFormProps
> = ({ functionName, metadata: passedMetadata }) => {
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
      <Box>
        <Group gap="xs">
          <FunctionSquare size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {functionName}
          </Text>
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

  return <Code block>{exampleCode}</Code>
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
