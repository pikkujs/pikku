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
} from '@mantine/core'
import {
  Package,
  Code2,
  Bot,
  KeyRound,
  Settings2,
  Download,
  Globe,
  Radio,
  Terminal,
  Cpu,
  BookOpen,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { ProjectFunctions } from '@/components/project/ProjectFunctions'
import type { FunctionsMeta } from '@pikku/core'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import type { ChannelsMeta } from '@pikku/core/channel'
import type { CLIProgramMeta } from '@pikku/core/cli'
import type {
  MCPToolMeta,
  MCPResourceMeta,
  MCPPromptMeta,
} from '@pikku/core/mcp'

interface McpMeta {
  toolsMeta: MCPToolMeta
  resourcesMeta: MCPResourceMeta
  promptsMeta: MCPPromptMeta
}

interface PackageRegistryEntry {
  id: string
  name: string
  displayName: string
  version: string
  description: string
  author?: string
  repository?: string
  license?: string
  readme?: string
  icon?: string
  tags: string[]
  functions: FunctionsMeta
  agents: Record<string, unknown>
  secrets: Record<string, unknown>
  variables: Record<string, unknown>
  httpRoutes: HTTPWiringsMeta
  channels: ChannelsMeta
  cli: Record<string, CLIProgramMeta>
  mcp: McpMeta | null
}

const PackageIcon: React.FunctionComponent<{
  icon?: string
  name: string
  size?: number
}> = ({ icon, name, size = 72 }) => {
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

const ReadOnlyTable: React.FunctionComponent<{
  headers: string[]
  rows: React.ReactNode[][]
}> = ({ headers, rows }) => (
  <Table highlightOnHover withRowBorders>
    <Table.Thead>
      <Table.Tr>
        {headers.map((h, i) => (
          <Table.Th
            key={h}
            pl={i === 0 ? 'md' : undefined}
            pr={i === headers.length - 1 ? 'md' : undefined}
            c="dimmed"
            fw={500}
            fz="xs"
          >
            {h}
          </Table.Th>
        ))}
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {rows.map((cells, ri) => (
        <Table.Tr key={ri} style={{ height: '3.75rem' }}>
          {cells.map((cell, ci) => (
            <Table.Td
              key={ci}
              pl={ci === 0 ? 'md' : undefined}
              pr={ci === cells.length - 1 ? 'md' : undefined}
            >
              {cell}
            </Table.Td>
          ))}
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
)

const HttpRoutesTab: React.FunctionComponent<{
  httpRoutes: PackageRegistryEntry['httpRoutes']
}> = ({ httpRoutes }) => {
  const rows: Array<{ method: string; route: string; sse?: boolean }> = []
  for (const [method, routes] of Object.entries(httpRoutes ?? {})) {
    for (const [, meta] of Object.entries(routes)) {
      if (method === 'options') continue
      rows.push({
        method: method.toUpperCase(),
        route: meta.route,
        sse: meta.sse,
      })
    }
  }
  return (
    <ReadOnlyTable
      headers={['METHOD', 'ROUTE', '']}
      rows={rows.map((r) => [
        <Code key="m">{r.method}</Code>,
        <Text key="r" size="sm" fw={500} ff="monospace">
          {r.route}
        </Text>,
        r.sse ? (
          <Badge key="s" size="xs" variant="light" color="teal">
            SSE
          </Badge>
        ) : null,
      ])}
    />
  )
}

const ChannelsTab: React.FunctionComponent<{
  channels: PackageRegistryEntry['channels']
}> = ({ channels }) => (
  <ReadOnlyTable
    headers={['NAME', 'ROUTE']}
    rows={Object.entries(channels ?? {}).map(([name, meta]) => [
      <Text key="n" size="sm" fw={500}>
        {name}
      </Text>,
      <Text key="r" size="sm" ff="monospace" c="dimmed">
        {meta.route}
      </Text>,
    ])}
  />
)

const CliTab: React.FunctionComponent<{
  cli: PackageRegistryEntry['cli']
}> = ({ cli }) => {
  const rows: Array<{
    program: string
    command: string
    description?: string
  }> = []
  for (const [program, prog] of Object.entries(cli ?? {})) {
    for (const [cmd, meta] of Object.entries(prog.commands ?? {})) {
      rows.push({ program, command: cmd, description: meta.description })
    }
  }
  return (
    <ReadOnlyTable
      headers={['PROGRAM', 'COMMAND', 'DESCRIPTION']}
      rows={rows.map((r) => [
        <Code key="p">{r.program}</Code>,
        <Text key="c" size="sm" fw={500}>
          {r.command}
        </Text>,
        <Text key="d" size="sm" c="dimmed">
          {r.description ?? ''}
        </Text>,
      ])}
    />
  )
}

const McpTab: React.FunctionComponent<{ mcp: McpMeta }> = ({ mcp }) => {
  const rows: Array<{ type: string; name: string; description?: string }> = []
  for (const [name, meta] of Object.entries(mcp.toolsMeta ?? {})) {
    rows.push({ type: 'Tool', name, description: (meta as any).description })
  }
  for (const [uri, meta] of Object.entries(mcp.resourcesMeta ?? {})) {
    rows.push({
      type: 'Resource',
      name: uri,
      description: (meta as any).description,
    })
  }
  for (const [name] of Object.entries(mcp.promptsMeta ?? {})) {
    rows.push({ type: 'Prompt', name })
  }
  return (
    <ReadOnlyTable
      headers={['TYPE', 'NAME', 'DESCRIPTION']}
      rows={rows.map((r) => [
        <Badge
          key="t"
          size="xs"
          variant="light"
          color={
            r.type === 'Tool'
              ? 'blue'
              : r.type === 'Resource'
                ? 'violet'
                : 'orange'
          }
        >
          {r.type}
        </Badge>,
        <Text key="n" size="sm" fw={500}>
          {r.name}
        </Text>,
        <Text key="d" size="sm" c="dimmed">
          {r.description ?? ''}
        </Text>,
      ])}
    />
  )
}

export const PackageDetailPage: React.FunctionComponent<{
  id: string
  onBack: () => void
}> = ({ id, onBack }) => {
  const rpc = usePikkuRPC()

  const { data: pkg, isLoading } = useQuery<PackageRegistryEntry | null>({
    queryKey: ['addon', id],
    queryFn: () =>
      rpc('console:getAddonPackage', {
        id,
      }) as Promise<PackageRegistryEntry | null>,
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
            category="Addons"
            categoryPath="/addons"
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
  const secretList = Object.entries(pkg.secrets ?? {})
  const variableList = Object.entries(pkg.variables ?? {})
  const httpRouteCount = Object.values(pkg.httpRoutes ?? {}).reduce(
    (sum, routes) => sum + Object.keys(routes).length,
    0
  )
  const channelList = Object.entries(pkg.channels ?? {})
  const cliCommandCount = Object.values(pkg.cli ?? {}).reduce(
    (sum, prog) => sum + Object.keys(prog.commands ?? {}).length,
    0
  )
  const mcpCount =
    Object.keys(pkg.mcp?.toolsMeta ?? {}).length +
    Object.keys(pkg.mcp?.resourcesMeta ?? {}).length +
    Object.keys(pkg.mcp?.promptsMeta ?? {}).length

  const defaultTab = pkg.readme
    ? 'readme'
    : functionList.length > 0
      ? 'functions'
      : agentList.length > 0
        ? 'agents'
        : httpRouteCount > 0
          ? 'http'
          : channelList.length > 0
            ? 'channels'
            : cliCommandCount > 0
              ? 'cli'
              : mcpCount > 0
                ? 'mcp'
                : secretList.length > 0
                  ? 'secrets'
                  : 'variables'

  const hasTabs =
    !!pkg.readme ||
    functionList.length > 0 ||
    agentList.length > 0 ||
    httpRouteCount > 0 ||
    channelList.length > 0 ||
    cliCommandCount > 0 ||
    mcpCount > 0 ||
    secretList.length > 0 ||
    variableList.length > 0

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Package}
          category="Addons"
          categoryPath="/addons"
          docsHref="https://pikkujs.com/docs/packages"
          subtitle={
            <Group gap="xs">
              <Text size="md" c="dimmed">
                /
              </Text>
              <Text size="md" c="dimmed">
                {pkg.displayName}
              </Text>
              <Text size="md" c="dimmed">
                /
              </Text>
              <Text size="md" fw={500}>
                {pkg.version}
              </Text>
            </Group>
          }
        />
      }
      hidePanel={functionList.length === 0}
      emptyPanelMessage="Select a function to view its details"
    >
      <Stack gap={0}>
        <Box
          px="md"
          py="md"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Group align="flex-start" gap="md" wrap="nowrap">
            <PackageIcon icon={pkg.icon} name={pkg.displayName} size={48} />
            <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
              <Group gap="sm" align="center" justify="space-between">
                <Group gap="xs" align="center">
                  <Text fw={600} size="lg">
                    {pkg.displayName}
                  </Text>
                  {pkg.author && (
                    <Text size="sm" c="dimmed">
                      by {pkg.author}
                    </Text>
                  )}
                  {pkg.license && (
                    <Badge size="xs" variant="outline" color="gray">
                      {pkg.license}
                    </Badge>
                  )}
                  {pkg.repository && (
                    <Anchor
                      size="xs"
                      href={pkg.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      c="dimmed"
                    >
                      {pkg.repository.replace(/^https?:\/\//, '')}
                    </Anchor>
                  )}
                </Group>
                <Button
                  size="xs"
                  leftSection={<Download size={13} />}
                  onClick={() => alert('Not yet implemented')}
                >
                  Install
                </Button>
              </Group>
              {pkg.description && (
                <Text size="sm" c="dimmed">
                  {pkg.description}
                </Text>
              )}
              {(pkg.tags ?? []).length > 0 && (
                <Group gap="xs">
                  {pkg.tags.map((tag) => (
                    <Badge key={tag} size="xs" variant="dot">
                      {tag}
                    </Badge>
                  ))}
                </Group>
              )}
            </Stack>
          </Group>
        </Box>

        {hasTabs && (
          <Tabs defaultValue={defaultTab}>
            <Box
              style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
              }}
            >
              <Tabs.List style={{ borderBottom: 'none' }}>
                {pkg.readme && (
                  <Tabs.Tab value="readme" leftSection={<BookOpen size={14} />}>
                    README
                  </Tabs.Tab>
                )}
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
                {httpRouteCount > 0 && (
                  <Tabs.Tab value="http" leftSection={<Globe size={14} />}>
                    HTTP Routes ({httpRouteCount})
                  </Tabs.Tab>
                )}
                {channelList.length > 0 && (
                  <Tabs.Tab value="channels" leftSection={<Radio size={14} />}>
                    Channels ({channelList.length})
                  </Tabs.Tab>
                )}
                {cliCommandCount > 0 && (
                  <Tabs.Tab value="cli" leftSection={<Terminal size={14} />}>
                    CLI ({cliCommandCount})
                  </Tabs.Tab>
                )}
                {mcpCount > 0 && (
                  <Tabs.Tab value="mcp" leftSection={<Cpu size={14} />}>
                    MCP ({mcpCount})
                  </Tabs.Tab>
                )}
                {secretList.length > 0 && (
                  <Tabs.Tab
                    value="secrets"
                    leftSection={<KeyRound size={14} />}
                  >
                    Secrets ({secretList.length})
                  </Tabs.Tab>
                )}
                {variableList.length > 0 && (
                  <Tabs.Tab
                    value="variables"
                    leftSection={<Settings2 size={14} />}
                  >
                    Variables ({variableList.length})
                  </Tabs.Tab>
                )}
              </Tabs.List>
            </Box>

            {pkg.readme && (
              <Tabs.Panel value="readme">
                <Box px="md" py="md">
                  <Code
                    block
                    style={{
                      whiteSpace: 'pre-wrap',
                      maxHeight: 'calc(100vh - 300px)',
                      overflow: 'auto',
                    }}
                  >
                    {pkg.readme}
                  </Code>
                </Box>
              </Tabs.Panel>
            )}

            {functionList.length > 0 && (
              <Tabs.Panel value="functions">
                <ProjectFunctions
                  functions={functionList.map(([key, fn]) => ({
                    ...fn,
                    pikkuFuncId: key,
                  }))}
                  functionUsedBy={new Map()}
                />
              </Tabs.Panel>
            )}

            {agentList.length > 0 && (
              <Tabs.Panel value="agents">
                <ReadOnlyTable
                  headers={['NAME']}
                  rows={agentList.map(([key]) => [
                    <Text key={key} size="sm" fw={500}>
                      {key}
                    </Text>,
                  ])}
                />
              </Tabs.Panel>
            )}

            {httpRouteCount > 0 && (
              <Tabs.Panel value="http">
                <HttpRoutesTab httpRoutes={pkg.httpRoutes} />
              </Tabs.Panel>
            )}

            {channelList.length > 0 && (
              <Tabs.Panel value="channels">
                <ChannelsTab channels={pkg.channels} />
              </Tabs.Panel>
            )}

            {cliCommandCount > 0 && (
              <Tabs.Panel value="cli">
                <CliTab cli={pkg.cli} />
              </Tabs.Panel>
            )}

            {mcpCount > 0 && pkg.mcp && (
              <Tabs.Panel value="mcp">
                <McpTab mcp={pkg.mcp} />
              </Tabs.Panel>
            )}

            {secretList.length > 0 && (
              <Tabs.Panel value="secrets">
                <ReadOnlyTable
                  headers={['KEY']}
                  rows={secretList.map(([key]) => [
                    <Text key={key} size="sm" fw={500}>
                      {key}
                    </Text>,
                  ])}
                />
              </Tabs.Panel>
            )}

            {variableList.length > 0 && (
              <Tabs.Panel value="variables">
                <ReadOnlyTable
                  headers={['KEY']}
                  rows={variableList.map(([key]) => [
                    <Text key={key} size="sm" fw={500}>
                      {key}
                    </Text>,
                  ])}
                />
              </Tabs.Panel>
            )}
          </Tabs>
        )}

      </Stack>
    </ResizablePanelLayout>
  )
}
