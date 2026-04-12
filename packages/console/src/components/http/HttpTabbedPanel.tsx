import React, { useMemo } from 'react'
import { Stack, SimpleGrid, Box, Divider } from '@mantine/core'
import { HttpConfiguration } from '../project/panels/WiringPanels'
import { SchemaSection } from '../project/panels/shared/SchemaSection'
import { SectionLabel } from '../project/panels/shared/SectionLabel'
import { CopyableCode } from '../ui/CopyableCode'
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
  const curlSnippet = useMemo(() => generateCurlSnippet(metadata), [metadata])
  const fetchSnippet = useMemo(
    () => generateFetchSnippet(metadata),
    [metadata]
  )
  const pikkuSnippet = useMemo(
    () => generatePikkuFetchSnippet(metadata),
    [metadata]
  )

  const hasSchemas =
    metadata?.inputSchemaName ||
    metadata?.outputSchemaName ||
    metadata?.headersSchemaName

  return (
    <Stack gap="lg" p="md">
      <HttpConfiguration wireId={wireId} metadata={metadata} />

      {hasSchemas && (
        <>
          <Divider />
          <SimpleGrid cols={2} spacing="lg">
            {metadata?.inputSchemaName && (
              <SchemaSection
                label="Input Schema"
                schemaName={metadata.inputSchemaName}
              />
            )}
            {metadata?.outputSchemaName && (
              <SchemaSection
                label="Output Schema"
                schemaName={metadata.outputSchemaName}
              />
            )}
          </SimpleGrid>
          {metadata?.headersSchemaName && (
            <SchemaSection
              label="Headers Schema"
              schemaName={metadata.headersSchemaName}
            />
          )}
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
