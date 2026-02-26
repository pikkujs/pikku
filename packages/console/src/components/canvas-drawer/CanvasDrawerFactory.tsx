import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CanvasDrawerData } from '@/context/DrawerContext'
import { Box, Text, Stack, Group, UnstyledButton, Loader } from '@mantine/core'
import { PikkuBadge } from '@/components/ui/PikkuBadge'
import {
  GitCompare,
  Split,
  Repeat,
  Workflow,
  Clock,
  CornerDownRight,
  XCircle,
  Plug,
  ChevronRight,
  ArrowLeft,
  Key,
  Wand2,
  Play,
  Globe,
  Radio,
  Calendar,
  ListTodo,
  Terminal,
  Bot,
  Cable,
  User,
} from 'lucide-react'
import { useAddonMeta, useFunctionsMeta } from '@/hooks/useWirings'
import { usePikkuRPC } from '@/context/PikkuRpcProvider'
import { Code2 } from 'lucide-react'

interface ExternalNode {
  name: string
  displayName: string
  category: string
  type: string
  rpc: string
  description: string
  errorOutput: boolean
  inputSchemaName: string
  outputSchemaName: string
}

interface ExternalCredential {
  name: string
  displayName: string
  description: string
  secretId: string
  schema: string
}

interface AddonMeta {
  package: string
  alias: string
  displayName: string
  description: string
  categories: string[]
  nodes: Record<string, ExternalNode[]>
  credentials: Record<string, ExternalCredential>
}

const IntegrationIcon: React.FunctionComponent<{
  alias: string
  size?: number
}> = ({ alias, size = 20 }) => {
  const rpc = usePikkuRPC()
  const { data: svgContent } = useQuery({
    queryKey: ['addon', 'icon', alias],
    queryFn: () => rpc('console:getAddonIcon', { alias }),
  })

  if (!svgContent) {
    return <Box style={{ width: size, height: size }} />
  }

  const dataUrl = `data:image/svg+xml,${encodeURIComponent(svgContent)}`

  return (
    <img
      src={dataUrl}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block' }}
    />
  )
}

type AddStepView =
  | 'main'
  | 'functions'
  | 'flow'
  | 'triggers'
  | 'wire'
  | 'transform'
  | 'integrations'
  | { type: 'integrationDetail'; integration: AddonMeta }

const flowNodes = [
  {
    id: 'startWorkflow',
    name: 'Start Workflow',
    description: 'Start another workflow',
    icon: Play,
  },
  {
    id: 'branch',
    name: 'If',
    description: 'Route items to different branches (true/false)',
    icon: Split,
  },
  {
    id: 'switch',
    name: 'Switch',
    description: 'Route items depending on defined expression or rules',
    icon: GitCompare,
  },
  {
    id: 'fanout',
    name: 'Loop Over Items (Split in Batches)',
    description: 'Split data into batches and iterate over each batch',
    icon: Repeat,
  },
  {
    id: 'parallel',
    name: 'Parallel',
    description: 'Execute multiple branches concurrently',
    icon: Workflow,
  },
  {
    id: 'sleep',
    name: 'Wait',
    description: 'Wait before continuing with execution',
    icon: Clock,
  },
  {
    id: 'return',
    name: 'Return',
    description: 'Return a value from the workflow',
    icon: CornerDownRight,
  },
  {
    id: 'cancel',
    name: 'Stop and Error',
    description: 'Throw an error in the workflow',
    icon: XCircle,
  },
]

const triggerNodes = [
  {
    id: 'http',
    name: 'HTTP',
    description: 'REST API endpoints and webhooks',
    icon: Globe,
  },
  {
    id: 'channel',
    name: 'Channel',
    description: 'Real-time WebSocket communication',
    icon: Radio,
  },
  {
    id: 'cli',
    name: 'CLI',
    description: 'Command-line interface commands',
    icon: Terminal,
  },
  {
    id: 'mcp',
    name: 'MCP',
    description: 'AI assistant tools (Model Context Protocol)',
    icon: Bot,
  },
  {
    id: 'scheduler',
    name: 'Scheduler',
    description: 'Time-based scheduled tasks',
    icon: Calendar,
  },
  {
    id: 'queue',
    name: 'Queue',
    description: 'Background job processing',
    icon: ListTodo,
  },
]

const wireNodes = {
  http: [
    {
      id: 'httpSetHeader',
      name: 'Set Header',
      description: 'Set an HTTP response header',
    },
    {
      id: 'httpSetStatus',
      name: 'Set Status',
      description: 'Set HTTP response status code',
    },
    {
      id: 'httpRedirect',
      name: 'Redirect',
      description: 'Redirect to another URL',
    },
    {
      id: 'httpSetCookie',
      name: 'Set Cookie',
      description: 'Set a response cookie',
    },
  ],
  channel: [
    {
      id: 'channelSend',
      name: 'Send Message',
      description: 'Send a message to the channel',
    },
    {
      id: 'channelBroadcast',
      name: 'Broadcast',
      description: 'Broadcast to all channel subscribers',
    },
    {
      id: 'channelClose',
      name: 'Close Connection',
      description: 'Close the WebSocket connection',
    },
  ],
  mcp: [
    {
      id: 'mcpDisableTool',
      name: 'Disable Tool',
      description: 'Disable an MCP tool',
    },
    {
      id: 'mcpEnableTool',
      name: 'Enable Tool',
      description: 'Enable an MCP tool',
    },
  ],
  session: [
    {
      id: 'sessionGet',
      name: 'Get Session',
      description: 'Get the current user session',
    },
    {
      id: 'sessionSet',
      name: 'Set Session',
      description: 'Set/update the user session',
    },
    {
      id: 'sessionClear',
      name: 'Clear Session',
      description: 'Clear the user session',
    },
  ],
}

const MenuButton: React.FunctionComponent<{
  icon: React.ElementType
  title: string
  description: string
  onClick: () => void
  showArrow?: boolean
}> = ({ icon: Icon, title, description, onClick, showArrow = true }) => {
  const [hovered, setHovered] = useState(false)
  return (
    <UnstyledButton
      onClick={onClick}
      p="md"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-2)',
        transition: 'background-color 0.15s',
        width: '100%',
        backgroundColor: hovered ? 'var(--mantine-color-gray-1)' : undefined,
      }}
    >
      <Group gap="md" wrap="nowrap" justify="space-between">
        <Group gap="md" wrap="nowrap">
          <Box style={{ color: 'var(--mantine-color-blue-6)' }}>
            <Icon size={20} />
          </Box>
          <Box style={{ flex: 1 }}>
            <Text size="sm" fw={500}>
              {title}
            </Text>
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          </Box>
        </Group>
        {showArrow && (
          <ChevronRight size={16} color="var(--mantine-color-gray-5)" />
        )}
      </Group>
    </UnstyledButton>
  )
}

const BackButton: React.FunctionComponent<{
  title: string
  iconAlias?: string
  onClick: () => void
}> = ({ title, iconAlias, onClick }) => (
  <UnstyledButton
    onClick={onClick}
    p="md"
    style={{
      borderBottom: '1px solid var(--mantine-color-gray-3)',
      width: '100%',
    }}
  >
    <Group gap="xs">
      <ArrowLeft size={16} />
      {iconAlias && <IntegrationIcon alias={iconAlias} size={16} />}
      <Text size="sm" fw={600}>
        {title}
      </Text>
    </Group>
  </UnstyledButton>
)

const NodeItem: React.FunctionComponent<{
  icon?: React.ElementType
  name: string
  description: string
  onClick?: () => void
}> = ({ icon: Icon, name, description, onClick }) => {
  const [hovered, setHovered] = useState(false)
  return (
    <UnstyledButton
      onClick={onClick}
      p="md"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-2)',
        transition: 'background-color 0.15s',
        width: '100%',
        backgroundColor: hovered ? 'var(--mantine-color-gray-1)' : undefined,
      }}
    >
      <Group gap="md" wrap="nowrap">
        {Icon && (
          <Box style={{ color: 'var(--mantine-color-blue-6)' }}>
            <Icon size={20} />
          </Box>
        )}
        <Box style={{ flex: 1 }}>
          <Text size="sm" fw={500}>
            {name}
          </Text>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </Box>
      </Group>
    </UnstyledButton>
  )
}

const FlowView: React.FunctionComponent<{ onBack: () => void }> = ({
  onBack,
}) => (
  <Box>
    <BackButton title="Flow" onClick={onBack} />
    <Stack gap={0}>
      {flowNodes.map((node) => (
        <NodeItem
          key={node.id}
          icon={node.icon}
          name={node.name}
          description={node.description}
        />
      ))}
    </Stack>
  </Box>
)

const TriggersView: React.FunctionComponent<{ onBack: () => void }> = ({
  onBack,
}) => (
  <Box>
    <BackButton title="Triggers" onClick={onBack} />
    <Stack gap={0}>
      {triggerNodes.map((node) => (
        <NodeItem
          key={node.id}
          icon={node.icon}
          name={node.name}
          description={node.description}
        />
      ))}
    </Stack>
  </Box>
)

const wireCategories = [
  { key: 'http', title: 'HTTP', icon: Globe },
  { key: 'channel', title: 'Channel', icon: Radio },
  { key: 'mcp', title: 'MCP', icon: Bot },
  { key: 'session', title: 'Session', icon: User },
] as const

const WireView: React.FunctionComponent<{ onBack: () => void }> = ({
  onBack,
}) => (
  <Box>
    <BackButton title="Wire" onClick={onBack} />
    <Stack gap={0}>
      {wireCategories.map(({ key, title }) => (
        <Box key={key}>
          <Box px="md" py="xs" bg="gray.1">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">
              {title}
            </Text>
          </Box>
          {wireNodes[key].map((node) => (
            <NodeItem
              key={node.id}
              name={node.name}
              description={node.description}
            />
          ))}
        </Box>
      ))}
    </Stack>
  </Box>
)

const TransformView: React.FunctionComponent<{
  onBack: () => void
}> = ({ onBack }) => {
  const { data: addonMeta, isLoading, isError } = useAddonMeta()

  const pikkuPackage = React.useMemo(() => {
    if (!addonMeta) return null
    return addonMeta.find((pkg: any) => pkg.alias === 'pikku')
  }, [addonMeta])

  const categories = pikkuPackage
    ? (Object.entries(pikkuPackage.nodes) as [string, ExternalNode[]][])
    : []

  return (
    <Box>
      <BackButton title="Transform" onClick={onBack} />
      {isLoading && (
        <Box p="xl" style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="sm" />
        </Box>
      )}
      {isError && (
        <Box p="md">
          <Text size="sm" c="red">
            Failed to load transforms
          </Text>
        </Box>
      )}
      {!isLoading && categories.length === 0 && (
        <Box p="md">
          <Text size="sm" c="dimmed">
            No transforms available
          </Text>
        </Box>
      )}
      {categories.length > 0 && (
        <Stack gap={0}>
          {categories.map(([category, nodes]) => (
            <Box key={category}>
              <Box px="md" py="xs" bg="gray.1">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  {category}
                </Text>
              </Box>
              {nodes.map((node: ExternalNode) => (
                <NodeItem
                  key={node.name}
                  name={node.displayName}
                  description={node.description}
                />
              ))}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}

const FunctionsView: React.FunctionComponent<{
  onBack: () => void
}> = ({ onBack }) => {
  const { data: functions, isLoading, isError } = useFunctionsMeta()
  const { data: addonMeta } = useAddonMeta()

  const internalFunctions = React.useMemo(() => {
    if (!functions) return []

    const addonRpcNames = new Set<string>()
    if (addonMeta) {
      for (const pkg of addonMeta as AddonMeta[]) {
        for (const nodes of Object.values(pkg.nodes)) {
          for (const node of nodes) {
            addonRpcNames.add(node.rpc)
          }
        }
      }
    }

    return (Object.values(functions) as any[]).filter(
      (fn: any) => !addonRpcNames.has(fn.name)
    )
  }, [functions, addonMeta])

  return (
    <Box>
      <BackButton title="Functions" onClick={onBack} />
      {isLoading && (
        <Box p="xl" style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="sm" />
        </Box>
      )}
      {isError && (
        <Box p="md">
          <Text size="sm" c="red">
            Failed to load functions
          </Text>
        </Box>
      )}
      {internalFunctions.length === 0 && !isLoading && (
        <Box p="md">
          <Text size="sm" c="dimmed">
            No functions available
          </Text>
        </Box>
      )}
      {internalFunctions.length > 0 && (
        <Stack gap={0}>
          {internalFunctions.map((fn: any) => (
            <NodeItem
              key={fn.name}
              icon={Code2}
              name={fn.name}
              description={fn.summary || fn.description || ''}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

const IntegrationItem: React.FunctionComponent<{
  integration: AddonMeta
  onSelect: () => void
}> = ({ integration, onSelect }) => {
  const [hovered, setHovered] = useState(false)
  const nodeCount = Object.values(integration.nodes).flat().length
  return (
    <UnstyledButton
      onClick={onSelect}
      p="md"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-2)',
        transition: 'background-color 0.15s',
        width: '100%',
        backgroundColor: hovered ? 'var(--mantine-color-gray-1)' : undefined,
      }}
    >
      <Group gap="md" wrap="nowrap" justify="space-between">
        <Group gap="md" wrap="nowrap" style={{ flex: 1 }}>
          <IntegrationIcon alias={integration.alias} size={20} />
          <Box style={{ flex: 1 }}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {integration.displayName}
              </Text>
              <PikkuBadge type="dynamic" badge="nodes" value={nodeCount} />
            </Group>
            <Text size="xs" c="dimmed">
              {integration.description}
            </Text>
          </Box>
        </Group>
        <ChevronRight size={16} color="var(--mantine-color-gray-5)" />
      </Group>
    </UnstyledButton>
  )
}

const IntegrationsView: React.FunctionComponent<{
  onBack: () => void
  onSelectIntegration: (integration: AddonMeta) => void
}> = ({ onBack, onSelectIntegration }) => {
  const { data: integrations, isLoading, isError } = useAddonMeta()

  const filteredIntegrations = React.useMemo(() => {
    if (!integrations) return []
    return integrations.filter((pkg: AddonMeta) => pkg.alias !== 'pikku')
  }, [integrations])

  return (
    <Box>
      <BackButton title="Integrations" onClick={onBack} />
      {isLoading && (
        <Box p="xl" style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="sm" />
        </Box>
      )}
      {isError && (
        <Box p="md">
          <Text size="sm" c="red">
            Failed to load integrations
          </Text>
        </Box>
      )}
      {filteredIntegrations.length === 0 && !isLoading && (
        <Box p="md">
          <Text size="sm" c="dimmed">
            No integrations available
          </Text>
        </Box>
      )}
      {filteredIntegrations.length > 0 && (
        <Stack gap={0}>
          {filteredIntegrations.map((integration: AddonMeta) => (
            <IntegrationItem
              key={integration.alias}
              integration={integration}
              onSelect={() => onSelectIntegration(integration)}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

const IntegrationDetailView: React.FunctionComponent<{
  integration: AddonMeta
  onBack: () => void
}> = ({ integration, onBack }) => {
  const categories = Object.entries(integration.nodes)

  return (
    <Box>
      <BackButton
        title={integration.displayName}
        iconAlias={integration.alias}
        onClick={onBack}
      />
      <Box
        p="md"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
      >
        <Text size="xs" c="dimmed">
          {integration.description}
        </Text>
        {Object.keys(integration.credentials).length > 0 && (
          <Box mt="sm">
            <Text size="xs" fw={600} c="dimmed" mb="xs">
              Credentials
            </Text>
            <Stack gap="xs">
              {Object.values(integration.credentials).map((cred) => (
                <Group key={cred.name} gap="xs" wrap="nowrap">
                  <Key size={14} color="var(--mantine-color-gray-5)" />
                  <Text size="xs">{cred.displayName}</Text>
                </Group>
              ))}
            </Stack>
          </Box>
        )}
      </Box>
      <Stack gap={0}>
        {categories.map(([category, nodes]) => (
          <Box key={category}>
            <Box px="md" py="xs" bg="gray.1">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                {category}
              </Text>
            </Box>
            {nodes.map((node: ExternalNode) => (
              <NodeItem
                key={node.name}
                name={node.displayName}
                description={node.description}
              />
            ))}
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

const AddStepContent: React.FunctionComponent = () => {
  const [view, setView] = useState<AddStepView>('main')

  if (view === 'functions') {
    return <FunctionsView onBack={() => setView('main')} />
  }

  if (view === 'flow') {
    return <FlowView onBack={() => setView('main')} />
  }

  if (view === 'triggers') {
    return <TriggersView onBack={() => setView('main')} />
  }

  if (view === 'wire') {
    return <WireView onBack={() => setView('main')} />
  }

  if (view === 'transform') {
    return <TransformView onBack={() => setView('main')} />
  }

  if (view === 'integrations') {
    return (
      <IntegrationsView
        onBack={() => setView('main')}
        onSelectIntegration={(integration) =>
          setView({ type: 'integrationDetail', integration })
        }
      />
    )
  }

  if (typeof view === 'object' && view.type === 'integrationDetail') {
    return (
      <IntegrationDetailView
        integration={view.integration}
        onBack={() => setView('integrations')}
      />
    )
  }

  return (
    <Box>
      <Box
        p="md"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
      >
        <Text size="sm" fw={600}>
          Add a node
        </Text>
      </Box>
      <Stack gap={0}>
        <MenuButton
          icon={Code2}
          title="Function"
          description="Call an internal function or RPC"
          onClick={() => setView('functions')}
        />
        <MenuButton
          icon={GitCompare}
          title="Flow"
          description="Branch, merge or loop the flow, etc."
          onClick={() => setView('flow')}
        />
        <MenuButton
          icon={Wand2}
          title="Transform"
          description="Edit, filter, and transform data"
          onClick={() => setView('transform')}
        />
        <MenuButton
          icon={Plug}
          title="Integrations"
          description="Third-party services and APIs"
          onClick={() => setView('integrations')}
        />
        <MenuButton
          icon={Radio}
          title="Triggers"
          description="HTTP, WebSocket, CLI, MCP, Queue, Scheduler"
          onClick={() => setView('triggers')}
        />
        <MenuButton
          icon={Cable}
          title="Wire"
          description="HTTP headers, session, channel, MCP tools"
          onClick={() => setView('wire')}
        />
      </Stack>
    </Box>
  )
}

export const createCanvasDrawerContent = (
  drawerData: CanvasDrawerData
): React.ReactNode => {
  switch (drawerData.type) {
    case 'addStep':
      return <AddStepContent />
    default:
      return null
  }
}
