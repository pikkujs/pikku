import React from 'react'
import {
  Stack,
  Text,
  TextInput,
  Textarea,
  Box,
  Tabs,
  Code,
  Title,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { CodeHighlight } from '@mantine/code-highlight'
import type { PikkuWiringTypes } from '@pikku/core'

interface SchedulerWireDetailsFormProps {
  wireType: PikkuWiringTypes
  wireId: string
  metadata: any
}

export const SchedulerWireDetailsForm: React.FC<
  SchedulerWireDetailsFormProps
> = ({ wireType, wireId, metadata }) => {
  const taskName = wireId
  const schedule = metadata.schedule || metadata.cron || '0 0 * * *'

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
          {asI18n(wireType)}
        </Title>
      </Box>

      <Tabs defaultValue="configuration">
        <Tabs.List px="md">
          <Tabs.Tab value="configuration">{asI18n('Configuration')}</Tabs.Tab>
          <Tabs.Tab value="meta">{asI18n('Meta')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="configuration" pt="md" px="md">
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} mb={4}>
                {asI18n('Schedule')}
              </Text>
              <Text size="lg">{asI18n(taskName)}</Text>
            </Box>

            <Box>
              <Text size="sm" fw={500} mb={4}>
                {asI18n('Cron Expression')}
              </Text>
              <Code>{schedule}</Code>
            </Box>

            <TextInput
              label={asI18n('Summary')}
              value={metadata.docs?.summary || ''}
              readOnly
            />

            <Textarea
              label={asI18n('Description')}
              value={metadata.docs?.description || ''}
              minRows={3}
              readOnly
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="meta" pt="md" px="md">
          <CodeHighlight
            code={JSON.stringify(metadata, null, 2)}
            language="json"
          />
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
