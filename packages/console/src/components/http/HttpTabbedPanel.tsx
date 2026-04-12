import React, { useMemo } from 'react'
import { Stack, SimpleGrid, Box, Divider } from '@mantine/core'
import { HttpConfiguration } from '../project/panels/WiringPanels'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { SectionLabel } from '../project/panels/shared/SectionLabel'
import { CopyableCode } from '../ui/CopyableCode'
import { useFunctionMeta, useSchema } from '../../hooks/useWirings'
import {
  generateCurlSnippet,
  generateFetchSnippet,
  generatePikkuFetchSnippet,
} from './httpSnippets'

interface HttpTabbedPanelProps {
  wireId: string
  metadata: any
}

export const HttpTabbedPanel: React.FunctionComponent<HttpTabbedPanelProps> = ({
  wireId,
  metadata,
}) => {
  const { data: funcMeta } = useFunctionMeta(metadata?.pikkuFuncId || '')
  const inputSchemaName = funcMeta?.inputSchemaName
  const outputSchemaName = funcMeta?.outputSchemaName
  const { data: inputSchema } = useSchema(inputSchemaName)

  const curlSnippet = useMemo(
    () => generateCurlSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )
  const fetchSnippet = useMemo(
    () => generateFetchSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )
  const pikkuSnippet = useMemo(
    () => generatePikkuFetchSnippet(metadata, inputSchema),
    [metadata, inputSchema]
  )

  const hasSchemas = inputSchemaName || outputSchemaName

  return (
    <Stack gap="lg" p="md">
      <HttpConfiguration wireId={wireId} metadata={metadata} />

      {hasSchemas && (
        <>
          <Divider />
          <SimpleGrid cols={2} spacing="lg">
            {inputSchemaName && (
              <SchemaSection
                label="Input Schema"
                schemaName={inputSchemaName}
              />
            )}
            {outputSchemaName && (
              <SchemaSection
                label="Output Schema"
                schemaName={outputSchemaName}
              />
            )}
          </SimpleGrid>
        </>
      )}

      <Divider />
      <Box>
        <SectionLabel>Client Usage</SectionLabel>
        <Stack gap="md" mt="xs">
          <CopyableCode label="pikku-fetch" code={pikkuSnippet} language="typescript" />
          <CopyableCode label="fetch" code={fetchSnippet} language="typescript" />
          <CopyableCode label="curl" code={curlSnippet} language="bash" />
        </Stack>
      </Box>
    </Stack>
  )
}
