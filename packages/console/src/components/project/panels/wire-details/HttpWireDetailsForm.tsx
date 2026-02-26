import {
  Stack,
  Text,
  TextInput,
  Textarea,
  Box,
  Tabs,
  Code,
  Title,
} from '@mantine/core'
import type { PikkuWiringTypes } from '@pikku/core'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface HttpWireDetailsFormProps {
  wireType: PikkuWiringTypes
  wireId: string
  metadata: any
}

export const HttpWireDetailsForm: React.FunctionComponent<
  HttpWireDetailsFormProps
> = ({ wireType, wireId, metadata }) => {
  const route = metadata.route || wireId
  const method = metadata.method?.toUpperCase() || 'GET'
  const isPublic = metadata.auth === false
  const isSSE = metadata.sse === true

  return (
    <Box h="100%">
      <Box
        px="md"
        py="md"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Title order={3} tt="uppercase">
          {wireType}
        </Title>
      </Box>

      <Tabs defaultValue="configuration">
        <Tabs.List px="md">
          <Tabs.Tab value="configuration">Configuration</Tabs.Tab>
          <Tabs.Tab value="meta">Meta</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="configuration" pt="md" px="md">
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} mb={4}>
                Route
              </Text>
              <Text size="lg">{route}</Text>
            </Box>

            <Box>
              <Text size="sm" fw={500} mb={4}>
                Method
              </Text>
              <PikkuBadge type="httpMethod" value={method} />
            </Box>

            <Box>
              <Text size="sm" fw={500} mb={4}>
                Server-Sent Events (SSE)
              </Text>
              <Text size="md">{isSSE ? 'Enabled' : 'Disabled'}</Text>
            </Box>

            <TextInput
              label="Summary"
              value={metadata.docs?.summary || ''}
              readOnly
            />

            <Textarea
              label="Description"
              value={metadata.docs?.description || ''}
              minRows={3}
              readOnly
            />

            <Box>
              <Text size="sm" fw={500} mb={4}>
                Public
              </Text>
              <Text size="md">{isPublic ? 'Yes' : 'No'}</Text>
            </Box>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="meta" pt="md" px="md">
          <Code block>{JSON.stringify(metadata, null, 2)}</Code>
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
