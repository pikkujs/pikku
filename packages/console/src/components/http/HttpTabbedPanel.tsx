import React, { useMemo } from 'react'
import { Tabs, Stack, SimpleGrid, Box } from '@mantine/core'
import { HttpConfiguration } from '@/components/project/panels/WiringPanels'
import { SchemaSection } from '@/components/project/panels/shared/SchemaSection'
import { CopyableCode } from '@/components/ui/CopyableCode'
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
  const rawJson = useMemo(
    () => JSON.stringify(metadata, null, 2),
    [metadata]
  )

  return (
    <Tabs defaultValue="configuration">
      <Tabs.List grow>
        <Tabs.Tab value="configuration">Configuration</Tabs.Tab>
        <Tabs.Tab value="schemas">Schemas</Tabs.Tab>
        <Tabs.Tab value="usage">Usage</Tabs.Tab>
        <Tabs.Tab value="raw">Raw</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="configuration" pt="md" px="md">
        <HttpConfiguration wireId={wireId} metadata={metadata} />
      </Tabs.Panel>

      <Tabs.Panel value="schemas" pt="md" px="md">
        <SimpleGrid cols={2} spacing="lg">
          <SchemaSection
            label="Input Schema"
            schemaName={metadata?.inputSchemaName}
          />
          <SchemaSection
            label="Output Schema"
            schemaName={metadata?.outputSchemaName}
          />
        </SimpleGrid>
        {metadata?.headersSchemaName && (
          <Box mt="lg">
            <SchemaSection
              label="Headers Schema"
              schemaName={metadata.headersSchemaName}
            />
          </Box>
        )}
      </Tabs.Panel>

      <Tabs.Panel value="usage" pt="md" px="md">
        <Stack gap="md">
          <CopyableCode label="curl" code={curlSnippet} />
          <CopyableCode label="fetch" code={fetchSnippet} />
          <CopyableCode label="pikku-fetch" code={pikkuSnippet} />
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="raw" pt="md" px="md">
        <CopyableCode code={rawJson} />
      </Tabs.Panel>
    </Tabs>
  )
}
