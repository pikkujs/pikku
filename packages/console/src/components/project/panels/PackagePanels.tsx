import React from 'react'
import { Stack, Text, Box, Group, Code, Table, Accordion } from '@mantine/core'
import {
  Package,
  FunctionSquare,
  Globe,
  Bot,
  KeyRound,
  Settings2,
  FileJson,
} from 'lucide-react'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import { SectionLabel } from '@/components/project/panels/shared/SectionLabel'

interface PackagePanelProps {
  packageId: string
  metadata?: any
}

export const PackageConfiguration: React.FunctionComponent<
  PackagePanelProps
> = ({ packageId, metadata = {} }) => {
  const functions = metadata?.functions ?? {}
  const rpcWirings = metadata?.rpcWirings ?? {}
  const agents = metadata?.agents ?? {}
  const secrets = metadata?.secrets ?? {}
  const variables = metadata?.variables ?? {}
  const schemas = metadata?.schemas ?? {}

  const functionEntries = Object.values(functions) as any[]
  const rpcEntries = Object.entries(rpcWirings)
  const agentEntries = Object.entries(agents)
  const secretEntries = Object.entries(secrets)
  const variableEntries = Object.entries(variables)
  const schemaEntries = Object.keys(schemas)

  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Package size={20} />
          <Text size="lg" ff="monospace" fw={600}>
            {metadata?.displayName || metadata?.name || packageId}
          </Text>
        </Group>
        {metadata?.description && (
          <Text size="sm" c="dimmed" mt={4}>
            {metadata.description}
          </Text>
        )}
      </Box>

      <Group gap="xs">
        <PikkuBadge type="label" color="blue">
          v{metadata?.version || '?'}
        </PikkuBadge>
        {metadata?.license && (
          <PikkuBadge type="label" color="gray">
            {metadata.license}
          </PikkuBadge>
        )}
      </Group>

      {metadata?.author && (
        <Box>
          <SectionLabel>Author</SectionLabel>
          <Text size="sm">{metadata.author}</Text>
        </Box>
      )}

      {metadata?.repository && (
        <Box>
          <SectionLabel>Repository</SectionLabel>
          <Code>{metadata.repository}</Code>
        </Box>
      )}

      <Accordion variant="separated" multiple defaultValue={['functions']}>
        {functionEntries.length > 0 && (
          <Accordion.Item value="functions">
            <Accordion.Control icon={<FunctionSquare size={16} />}>
              Functions ({functionEntries.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Input</Table.Th>
                    <Table.Th>Output</Table.Th>
                    <Table.Th>Expose</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {functionEntries.map((fn: any) => (
                    <Table.Tr key={fn.name}>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {fn.name}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {fn.inputSchemaName || '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {fn.outputSchemaName || '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {fn.expose && (
                          <PikkuBadge type="label" color="green">
                            exposed
                          </PikkuBadge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {rpcEntries.length > 0 && (
          <Accordion.Item value="rpc">
            <Accordion.Control icon={<Globe size={16} />}>
              RPC Wirings ({rpcEntries.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {rpcEntries.map(([key, value]) => (
                  <Group key={key} gap="xs">
                    <Code>{key}</Code>
                    <Text size="xs" c="dimmed">
                      →
                    </Text>
                    <Code>{String(value)}</Code>
                  </Group>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {agentEntries.length > 0 && (
          <Accordion.Item value="agents">
            <Accordion.Control icon={<Bot size={16} />}>
              Agents ({agentEntries.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {agentEntries.map(([name]) => (
                  <Code key={name}>{name}</Code>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {secretEntries.length > 0 && (
          <Accordion.Item value="secrets">
            <Accordion.Control icon={<KeyRound size={16} />}>
              Secrets ({secretEntries.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {secretEntries.map(([name]) => (
                  <Code key={name}>{name}</Code>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {variableEntries.length > 0 && (
          <Accordion.Item value="variables">
            <Accordion.Control icon={<Settings2 size={16} />}>
              Variables ({variableEntries.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {variableEntries.map(([name]) => (
                  <Code key={name}>{name}</Code>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {schemaEntries.length > 0 && (
          <Accordion.Item value="schemas">
            <Accordion.Control icon={<FileJson size={16} />}>
              Schemas ({schemaEntries.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {schemaEntries.map((name) => (
                  <Code key={name}>{name}</Code>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}
      </Accordion>
    </Stack>
  )
}
