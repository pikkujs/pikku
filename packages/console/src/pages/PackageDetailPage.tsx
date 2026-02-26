import React from 'react'
import {
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Center,
  Stack,
  Table,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { Package, Code2, Bot, Radio, KeyRound, Settings2, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'

interface FunctionMeta {
  functionType: string
  expose: boolean
  inputSchemaName?: string
  outputSchemaName?: string
}

interface PackageDetail {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author?: string
  license?: string
  repository?: string
  readme?: string
  icon?: string
  tags: string[]
  categories: string[]
  functions: Record<string, FunctionMeta>
  rpcWirings: Record<string, string>
  agents: Record<string, unknown>
  secrets: Record<string, unknown>
  variables: Record<string, unknown>
}

const PackageIcon: React.FunctionComponent<{ icon?: string; name: string; size?: number }> = ({
  icon,
  name,
  size = 72,
}) => {
  if (icon) {
    const src = icon.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`
      : icon
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={name}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    )
  }
  return (
    <ThemeIcon size={size} radius="md" variant="light" color="blue">
      <Package size={size * 0.5} />
    </ThemeIcon>
  )
}

export const PackageDetailPage: React.FunctionComponent<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const rpc = usePikkuRPC()

  const { data: pkg, isLoading } = useQuery<PackageDetail | null>({
    queryKey: ['external-package', id],
    queryFn: () => rpc('console:getExternalPackage', { id }) as Promise<PackageDetail | null>,
  })

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!pkg) {
    return (
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Package}
            category="Packages"
            categoryPath="/registry/packages"
            docsHref="https://pikkujs.com/docs/packages"
          />
        }
        hidePanel
      >
        <Box p="xl">
          <Text c="dimmed">Package not found.</Text>
        </Box>
      </ResizablePanelLayout>
    )
  }

  const functionList = Object.entries(pkg.functions ?? {})
  const agentList = Object.entries(pkg.agents ?? {})
  const rpcList = Object.entries(pkg.rpcWirings ?? {})
  const secretList = Object.entries(pkg.secrets ?? {})
  const variableList = Object.entries(pkg.variables ?? {})

  const defaultTab =
    functionList.length > 0 ? 'functions'
    : agentList.length > 0 ? 'agents'
    : rpcList.length > 0 ? 'rpc'
    : secretList.length > 0 ? 'secrets'
    : 'variables'

  const hasTabs =
    functionList.length > 0 ||
    agentList.length > 0 ||
    rpcList.length > 0 ||
    secretList.length > 0 ||
    variableList.length > 0

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Package}
          category="Packages"
          categoryPath="/registry/packages"
          docsHref="https://pikkujs.com/docs/packages"
          subtitle={
            <Group gap="xs">
              <Text size="md" c="dimmed">/</Text>
              <Text size="md" c="dimmed">{pkg.displayName}</Text>
              <Text size="md" c="dimmed">/</Text>
              <Text size="md" fw={500}>{pkg.version}</Text>
            </Group>
          }
        />
      }
      hidePanel
    >
      <Stack gap={0}>
        <Box
          px="md"
          py="md"
          style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
          <Group align="flex-start" gap="md" wrap="nowrap">
            <PackageIcon icon={pkg.icon} name={pkg.displayName} size={48} />
            <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
              <Group gap="sm" align="center" justify="space-between">
                <Group gap="xs" align="center">
                  <Text fw={600} size="lg">{pkg.displayName}</Text>
                  {pkg.author && <Text size="sm" c="dimmed">by {pkg.author}</Text>}
                  {pkg.license && <Badge size="xs" variant="outline" color="gray">{pkg.license}</Badge>}
                  {pkg.repository && (
                    <Anchor size="xs" href={pkg.repository} target="_blank" rel="noopener noreferrer" c="dimmed">
                      {pkg.repository.replace(/^https?:\/\//, '')}
                    </Anchor>
                  )}
                </Group>
                <Button size="xs" leftSection={<Download size={13} />} onClick={() => alert('Not yet implemented')}>
                  Install
                </Button>
              </Group>
              {pkg.description && <Text size="sm" c="dimmed">{pkg.description}</Text>}
              {(pkg.tags ?? []).length > 0 && (
                <Group gap="xs">
                  {pkg.tags.map((tag) => (
                    <Badge key={tag} size="xs" variant="dot">{tag}</Badge>
                  ))}
                </Group>
              )}
            </Stack>
          </Group>
        </Box>

        {hasTabs && (
          <Tabs defaultValue={defaultTab}>
            <Box
              px="md"
              style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
            >
              <Tabs.List style={{ borderBottom: 'none' }}>
                {functionList.length > 0 && (
                  <Tabs.Tab value="functions" leftSection={<Code2 size={14} />}>
                    Functions ({functionList.length})
                  </Tabs.Tab>
                )}
                {agentList.length > 0 && (
                  <Tabs.Tab value="agents" leftSection={<Bot size={14} />}>
                    Agents ({agentList.length})
                  </Tabs.Tab>
                )}
                {rpcList.length > 0 && (
                  <Tabs.Tab value="rpc" leftSection={<Radio size={14} />}>
                    RPC Wirings ({rpcList.length})
                  </Tabs.Tab>
                )}
                {secretList.length > 0 && (
                  <Tabs.Tab value="secrets" leftSection={<KeyRound size={14} />}>
                    Secrets ({secretList.length})
                  </Tabs.Tab>
                )}
                {variableList.length > 0 && (
                  <Tabs.Tab value="variables" leftSection={<Settings2 size={14} />}>
                    Variables ({variableList.length})
                  </Tabs.Tab>
                )}
              </Tabs.List>
            </Box>

            {functionList.length > 0 && (
              <Tabs.Panel value="functions">
                <Table highlightOnHover withRowBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th pl="md" c="dimmed" fw={500} fz="xs">NAME</Table.Th>
                      <Table.Th c="dimmed" fw={500} fz="xs">TYPE</Table.Th>
                      <Table.Th c="dimmed" fw={500} fz="xs">INPUT</Table.Th>
                      <Table.Th c="dimmed" fw={500} fz="xs">OUTPUT</Table.Th>
                      <Table.Th pr="md" c="dimmed" fw={500} fz="xs">EXPOSED</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {functionList.map(([key, fn]) => (
                      <Table.Tr key={key} style={{ height: '3.75rem' }}>
                        <Table.Td pl="md"><Text size="sm" fw={500}>{key}</Text></Table.Td>
                        <Table.Td><Badge size="sm" variant="light" color="blue">{fn.functionType}</Badge></Table.Td>
                        <Table.Td>{fn.inputSchemaName ? <Code>{fn.inputSchemaName}</Code> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                        <Table.Td>{fn.outputSchemaName ? <Code>{fn.outputSchemaName}</Code> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                        <Table.Td pr="md"><Badge size="sm" variant="light" color={fn.expose ? 'green' : 'gray'}>{fn.expose ? 'Yes' : 'No'}</Badge></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            )}

            {agentList.length > 0 && (
              <Tabs.Panel value="agents">
                <Table highlightOnHover withRowBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th pl="md" c="dimmed" fw={500} fz="xs">NAME</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {agentList.map(([key]) => (
                      <Table.Tr key={key} style={{ height: '3.75rem' }}>
                        <Table.Td pl="md"><Text size="sm" fw={500}>{key}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            )}

            {rpcList.length > 0 && (
              <Tabs.Panel value="rpc">
                <Table highlightOnHover withRowBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th pl="md" c="dimmed" fw={500} fz="xs">RPC NAME</Table.Th>
                      <Table.Th pr="md" c="dimmed" fw={500} fz="xs">FUNCTION</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rpcList.map(([rpcName, funcName]) => (
                      <Table.Tr key={rpcName} style={{ height: '3.75rem' }}>
                        <Table.Td pl="md"><Text size="sm" fw={500}>{rpcName}</Text></Table.Td>
                        <Table.Td pr="md"><Code>{funcName}</Code></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            )}

            {secretList.length > 0 && (
              <Tabs.Panel value="secrets">
                <Table highlightOnHover withRowBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th pl="md" c="dimmed" fw={500} fz="xs">KEY</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {secretList.map(([key]) => (
                      <Table.Tr key={key} style={{ height: '3.75rem' }}>
                        <Table.Td pl="md"><Text size="sm" fw={500}>{key}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            )}

            {variableList.length > 0 && (
              <Tabs.Panel value="variables">
                <Table highlightOnHover withRowBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th pl="md" c="dimmed" fw={500} fz="xs">KEY</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {variableList.map(([key]) => (
                      <Table.Tr key={key} style={{ height: '3.75rem' }}>
                        <Table.Td pl="md"><Text size="sm" fw={500}>{key}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Tabs.Panel>
            )}
          </Tabs>
        )}

        {pkg.readme && (
          <Box px="md" py="md">
            <Title order={5} mb="sm">README</Title>
            <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>
              {pkg.readme}
            </Code>
          </Box>
        )}
      </Stack>
    </ResizablePanelLayout>
  )
}
