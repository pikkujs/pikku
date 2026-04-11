import React from 'react'
import {
  Alert,
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
  TypographyStylesProvider,
} from '@mantine/core'
import {
  Package,
  Code2,
  Bot,
  KeyRound,
  Settings2,
  Check,
  Download,
  Globe,
  Radio,
  Terminal,
  Cpu,
  BookOpen,
  ArrowUp,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { ProjectFunctions } from '@/components/project/ProjectFunctions'
import { ProjectSecrets } from '@/components/project/ProjectSecrets'
import { ProjectVariables } from '@/components/project/ProjectVariables'
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

interface SecretEntry {
  name: string
  displayName: string
  description?: string
  secretId: string
}

interface VariableEntry {
  name: string
  displayName: string
  description?: string
  variableId: string
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
  secrets: Record<string, SecretEntry>
  variables: Record<string, VariableEntry>
  httpRoutes: HTTPWiringsMeta
  channels: ChannelsMeta
  cli: Record<string, CLIProgramMeta>
  mcp: McpMeta | null
  schemas: Record<string, unknown>
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
    <ThemeIcon size={size} radius="md" variant="light" color="gray">
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
  source: 'installed' | 'community' | 'api'
  onBack: () => void
}> = ({ id, source, onBack }) => {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = React.useState<string | null>(null)

  const { data: installedAddons } = useQuery<
    Array<{ packageName: string; namespace: string }>
  >({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons', null)
      return (result ?? []) as Array<{
        packageName: string
        namespace: string
      }>
    },
    staleTime: 60 * 1000,
  })

  const installedAddon = (installedAddons ?? []).find(
    (a) => a.packageName === id
  )
  const isInstalled = source === 'installed' || !!installedAddon

  const { data: installedPkg } = useQuery<PackageRegistryEntry | null>({
    queryKey: ['addon', 'installed', id],
    queryFn: async () => {
      return (await rpc.invoke('console:getAddonInstalledPackage', {
        packageName: id,
      })) as PackageRegistryEntry | null
    },
    enabled: isInstalled && source === 'community',
  })

  const installMutation = useMutation({
    mutationFn: async ({
      packageName,
      namespace,
      version,
    }: {
      packageName: string
      namespace: string
      version?: string
    }) =>
      rpc.invoke('console:installAddon', {
        packageName,
        namespace,
        version,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
  })

  const installOpenapiMutation = useMutation({
    mutationFn: async ({
      name,
      swaggerUrl,
      credential,
    }: {
      name: string
      swaggerUrl: string
      credential?: 'apikey' | 'bearer' | 'oauth2'
    }) =>
      rpc.invoke('console:installOpenapiAddon', {
        name,
        swaggerUrl,
        credential,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
  })

  const { data: apiDetail } = useQuery({
    queryKey: ['openapi-detail', id],
    queryFn: async () => {
      // Check cached openapi queries first
      const cached = queryClient.getQueriesData<{
        apis: any[]
        total: number
      }>({ queryKey: ['openapis'] })
      for (const [, data] of cached) {
        const match = data?.apis?.find((a: any) => a.name === id)
        if (match) return match
      }
      // Fallback: fetch from registry
      const result = await rpc.invoke('console:getOpenapis', {
        limit: 2600,
        offset: 0,
      })
      return result.apis?.find((a: any) => a.name === id) ?? null
    },
    enabled: source === 'api',
  })

  const { data: pkg, isLoading } = useQuery<PackageRegistryEntry | null>({
    queryKey: ['addon', source, id],
    queryFn: async () => {
      const result = await (source === 'installed'
        ? (rpc.invoke('console:getAddonInstalledPackage', {
            packageName: id,
          }) as Promise<PackageRegistryEntry | null>)
        : (rpc.invoke('console:getAddonCommunityPackage', {
            id,
          }) as Promise<PackageRegistryEntry | null>))
      if (result?.schemas) {
        for (const [schemaName, schema] of Object.entries(result.schemas)) {
          queryClient.setQueryData(['schema', schemaName], schema)
        }
      }
      return result
    },
    enabled: source !== 'api',
  })

  if (source === 'api') {
    const api = apiDetail
    if (!api) {
      return (
        <Center h="100vh">
          <Loader />
        </Center>
      )
    }
    return (
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Globe}
            category="APIs"
            categoryPath="/addons"
            docsHref="https://pikku.dev/docs/external-packages"
          />
        }
        hidePanel
      >
        <Box p="xl">
          <Stack gap="lg">
            <Group gap="md">
              {api.logo && (
                <img
                  src={api.logo}
                  width={48}
                  height={48}
                  alt={api.title}
                  style={{ objectFit: 'contain', borderRadius: 6 }}
                />
              )}
              <div>
                <Group gap="xs">
                  <Text size="xl" fw={700}>
                    {api.title || api.name}
                  </Text>
                  <Badge size="sm" variant="light" color="gray">
                    {api.openapiVer}
                  </Badge>
                  <Badge size="sm" variant="light">
                    v{api.version}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {api.provider}
                  {api.service ? ` / ${api.service}` : ''}
                </Text>
              </div>
            </Group>

            {api.description && (
              <Text size="sm">{api.description}</Text>
            )}

            {(api.categories?.length > 0 || api.tags?.length > 0) && (
              <Group gap={6}>
                {api.categories?.map((c: string) => (
                  <Badge key={c} size="xs" variant="light" color="blue">
                    {c}
                  </Badge>
                ))}
                {api.tags?.map((t: string) => (
                  <Badge key={t} size="xs" variant="dot">
                    {t}
                  </Badge>
                ))}
              </Group>
            )}

            {api.totalOperations > 0 && (
              <Box>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                  Operations ({api.totalOperations})
                </Text>
                <Group gap={6}>
                  {api.opsGet > 0 && (
                    <Badge size="xs" color="blue">
                      GET {api.opsGet}
                    </Badge>
                  )}
                  {api.opsPost > 0 && (
                    <Badge size="xs" color="green">
                      POST {api.opsPost}
                    </Badge>
                  )}
                  {api.opsPut > 0 && (
                    <Badge size="xs" color="yellow">
                      PUT {api.opsPut}
                    </Badge>
                  )}
                  {api.opsPatch > 0 && (
                    <Badge size="xs" color="orange">
                      PATCH {api.opsPatch}
                    </Badge>
                  )}
                  {api.opsDelete > 0 && (
                    <Badge size="xs" color="red">
                      DELETE {api.opsDelete}
                    </Badge>
                  )}
                </Group>
              </Box>
            )}

            {api.servers?.length > 0 && (
              <Box>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                  Servers
                </Text>
                {api.servers.map((s: string) => (
                  <Code key={s} block style={{ fontSize: '12px' }}>
                    {s}
                  </Code>
                ))}
              </Box>
            )}

            {api.securitySchemes?.length > 0 && (
              <Box>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                  Authentication
                </Text>
                <Group gap={6}>
                  {api.securitySchemes.map((s: string) => (
                    <Badge key={s} size="xs" variant="outline" color="gray">
                      {s}
                    </Badge>
                  ))}
                </Group>
              </Box>
            )}

            {api.contentTypes?.length > 0 && (
              <Box>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>
                  Content Types
                </Text>
                <Group gap={6}>
                  {api.contentTypes.map((c: string) => (
                    <Badge key={c} size="xs" variant="outline" color="gray">
                      {c}
                    </Badge>
                  ))}
                </Group>
              </Box>
            )}

            <Group gap="xs">
              {api.swaggerUrl && (
                <Button
                  size="xs"
                  variant="light"
                  component="a"
                  href={api.swaggerUrl}
                  target="_blank"
                  leftSection={<BookOpen size={13} />}
                >
                  OpenAPI JSON
                </Button>
              )}
              {api.swaggerYamlUrl && (
                <Button
                  size="xs"
                  variant="light"
                  component="a"
                  href={api.swaggerYamlUrl}
                  target="_blank"
                  leftSection={<BookOpen size={13} />}
                >
                  OpenAPI YAML
                </Button>
              )}
              <Button
                size="xs"
                leftSection={<Download size={13} />}
                loading={installOpenapiMutation.isPending}
                onClick={() => {
                  let addonName = api.name
                    .replace(/[^a-zA-Z0-9-]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')
                  if (/^[0-9]/.test(addonName)) {
                    addonName = `x${addonName}`
                  }
                  const credential = api.securitySchemes?.includes('oauth2')
                    ? 'oauth2' as const
                    : api.securitySchemes?.includes('bearer')
                      ? 'bearer' as const
                      : api.securitySchemes?.includes('apiKey')
                        ? 'apikey' as const
                        : undefined
                  installOpenapiMutation.mutate({
                    name: addonName,
                    swaggerUrl: api.swaggerUrl,
                    credential,
                  })
                }}
              >
                Generate & Install Addon
              </Button>
            </Group>

            {installOpenapiMutation.isSuccess && (
              <Alert color="green" icon={<Check size={16} />}>
                Addon generated and installed successfully!
              </Alert>
            )}
            {installOpenapiMutation.error && (
              <Alert color="red">
                {(installOpenapiMutation.error as Error).message}
              </Alert>
            )}
          </Stack>
        </Box>
      </ResizablePanelLayout>
    )
  }

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
            docsHref="https://pikku.dev/docs/external-packages"
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

  const currentTab = activeTab ?? defaultTab

  const hasTabs = true

  const panelTabs = ['functions', 'secrets', 'variables']
  const showPanel = panelTabs.includes(currentTab)
  const emptyPanelMessage =
    currentTab === 'secrets'
      ? 'Select a secret to view its details'
      : currentTab === 'variables'
        ? 'Select a variable to view its details'
        : 'Select a function to view its details'

  return (
    <ResizablePanelLayout
      header={
        <DetailPageHeader
          icon={Package}
          category="Addons"
          categoryPath="/addons"
          docsHref="https://pikku.dev/docs/external-packages"
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
      hidePanel={!showPanel}
      emptyPanelMessage={emptyPanelMessage}
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
                {(() => {
                  const communityVersion = pkg.version
                  const installedVersion = installedPkg?.version
                  const needsUpdate =
                    isInstalled &&
                    installedVersion &&
                    communityVersion &&
                    installedVersion !== communityVersion

                  if (needsUpdate) {
                    return (
                      <Button
                        size="xs"
                        color="yellow"
                        leftSection={<ArrowUp size={13} />}
                        loading={installMutation.isPending}
                        onClick={() =>
                          installMutation.mutate({
                            packageName: pkg.name,
                            namespace:
                              installedAddon?.namespace ??
                              pkg.name
                                .replace('@pikku/addon-', '')
                                .replace(/^@.*\//, ''),
                            version: communityVersion,
                          })
                        }
                      >
                        Update to {communityVersion}
                      </Button>
                    )
                  }
                  if (isInstalled) {
                    return (
                      <Button
                        size="xs"
                        variant="light"
                        color="green"
                        leftSection={<Check size={13} />}
                        disabled
                      >
                        Installed
                      </Button>
                    )
                  }
                  return (
                    <Button
                      size="xs"
                      leftSection={<Download size={13} />}
                      loading={installMutation.isPending}
                      onClick={() =>
                        installMutation.mutate({
                          packageName: pkg.name,
                          namespace: pkg.name
                            .replace('@pikku/addon-', '')
                            .replace(/^@.*\//, ''),
                          version: communityVersion,
                        })
                      }
                    >
                      Install
                    </Button>
                  )
                })()}
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
          <Tabs value={currentTab} onChange={setActiveTab}>
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
                <Tabs.Tab
                  value="secrets"
                  leftSection={<KeyRound size={14} />}
                  disabled={secretList.length === 0}
                >
                  Secrets ({secretList.length})
                </Tabs.Tab>
                <Tabs.Tab
                  value="variables"
                  leftSection={<Settings2 size={14} />}
                  disabled={variableList.length === 0}
                >
                  Variables ({variableList.length})
                </Tabs.Tab>
              </Tabs.List>
            </Box>

            {pkg.readme && (
              <Tabs.Panel value="readme">
                <TypographyStylesProvider
                  px="xl"
                  py="md"
                  style={{
                    maxHeight: 'calc(100vh - 280px)',
                    overflow: 'auto',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {pkg.readme}
                  </ReactMarkdown>
                </TypographyStylesProvider>
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

            <Tabs.Panel value="secrets">
              <ProjectSecrets
                secrets={secretList.map(([, s]) => s)}
                installed={false}
              />
            </Tabs.Panel>

            <Tabs.Panel value="variables">
              <ProjectVariables
                variables={variableList.map(([, v]) => v)}
                installed={false}
              />
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </ResizablePanelLayout>
  )
}
