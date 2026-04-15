import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CanvasDrawerData } from '../../context/DrawerContext'
import { Box, Text, Stack, Group, UnstyledButton, Loader } from '@mantine/core'
import { PikkuBadge } from '../ui/PikkuBadge'
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
import { useAddonMeta, useFunctionsMeta } from '../../hooks/useWirings'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { Code2 } from 'lucide-react'
import classes from '../ui/console.module.css'

interface AddonMeta {
  id: string
  name: string
  displayName: string
  description: string
  categories: string[]
  functions: Record<string, unknown>
  secrets: Record<string, unknown>
  icon?: string
}

const AddonIcon: React.FunctionComponent<{
  id: string
  size?: number
}> = ({ id, size = 20 }) => {
  const rpc = usePikkuRPC()
  const { data: svgContent } = useQuery({
    queryKey: ['addon', 'icon', id],
    queryFn: () => rpc.invoke('console:getAddonIcon', { alias: id }),
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
  | 'addons'
  | { type: 'addonDetail'; addon: AddonMeta }

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
      className={classes.drawerButton}
      style={{
        backgroundColor: hovered ? 'var(--mantine-color-gray-1)' : undefined,
      }}
    >
      <Group gap="md" wrap="nowrap" justify="space-between">
        <Group gap="md" wrap="nowrap">
          <Box className={classes.drawerIconBox}>
            <Icon size={20} />
          </Box>
          <Box className={classes.flexGrow}>
            <Text size="sm" fw={500}>
              {title}
            </Text>
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          </Box>
        </Group>
        {showArrow && (
          <ChevronRight size={16} color="var(--mantine-color-default-border)" />
        )}
      </Group>
    </UnstyledButton>
  )
}

const BackButton: React.FunctionComponent<{
  title: string
  iconId?: string
  onClick: () => void
}> = ({ title, iconId, onClick }) => (
  <UnstyledButton
    onClick={onClick}
    p="md"
    className={classes.drawerButton}
  >
    <Group gap="xs">
      <ArrowLeft size={16} />
      {iconId && <AddonIcon id={iconId} size={16} />}
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
      className={classes.drawerButton}
      style={{
        backgroundColor: hovered ? 'var(--mantine-color-gray-1)' : undefined,
      }}
    >
      <Group gap="md" wrap="nowrap">
        {Icon && (
          <Box className={classes.drawerIconBox}>
            <Icon size={20} />
          </Box>
        )}
        <Box className={classes.flexGrow}>
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
          <Box px="md" py="xs" bg="var(--mantine-color-default-hover)">
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
  const { isLoading, isError } = useAddonMeta()

  return (
    <Box>
      <BackButton title="Transform" onClick={onBack} />
      {isLoading && (
        <Box p="xl" className={classes.centeredLoader}>
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
      {!isLoading && !isError && (
        <Box p="md">
          <Text size="sm" c="dimmed">
            No transforms available
          </Text>
        </Box>
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

    const addonFuncNames = new Set<string>()
    if (addonMeta) {
      for (const pkg of addonMeta as AddonMeta[]) {
        for (const name of Object.keys(pkg.functions ?? {})) {
          addonFuncNames.add(name)
        }
      }
    }

    return (Object.values(functions) as any[]).filter(
      (fn: any) => !addonFuncNames.has(fn.name)
    )
  }, [functions, addonMeta])

  return (
    <Box>
      <BackButton title="Functions" onClick={onBack} />
      {isLoading && (
        <Box p="xl" className={classes.centeredLoader}>
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

const AddonItem: React.FunctionComponent<{
  addon: AddonMeta
  onSelect: () => void
}> = ({ addon, onSelect }) => {
  const [hovered, setHovered] = useState(false)
  const functionCount = Object.keys(addon.functions ?? {}).length
  return (
    <UnstyledButton
      onClick={onSelect}
      p="md"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={classes.drawerButton}
      style={{
        backgroundColor: hovered ? 'var(--mantine-color-gray-1)' : undefined,
      }}
    >
      <Group gap="md" wrap="nowrap" justify="space-between">
        <Group gap="md" wrap="nowrap" className={classes.flexGrow}>
          <AddonIcon id={addon.id} size={20} />
          <Box className={classes.flexGrow}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {addon.displayName}
              </Text>
              <PikkuBadge type="dynamic" badge="functions" value={functionCount} />
            </Group>
            <Text size="xs" c="dimmed">
              {addon.description}
            </Text>
          </Box>
        </Group>
        <ChevronRight size={16} color="var(--mantine-color-default-border)" />
      </Group>
    </UnstyledButton>
  )
}

const AddonsView: React.FunctionComponent<{
  onBack: () => void
  onSelectAddon: (addon: AddonMeta) => void
}> = ({ onBack, onSelectAddon }) => {
  const { data: addons, isLoading, isError } = useAddonMeta()

  const filteredAddons = React.useMemo(() => {
    if (!addons) return []
    return addons.filter((pkg: AddonMeta) => pkg.id !== 'pikku')
  }, [addons])

  return (
    <Box>
      <BackButton title="Addons" onClick={onBack} />
      {isLoading && (
        <Box p="xl" className={classes.centeredLoader}>
          <Loader size="sm" />
        </Box>
      )}
      {isError && (
        <Box p="md">
          <Text size="sm" c="red">
            Failed to load addons
          </Text>
        </Box>
      )}
      {filteredAddons.length === 0 && !isLoading && !isError && (
        <Box p="md">
          <Text size="sm" c="dimmed">
            No addons available
          </Text>
        </Box>
      )}
      {filteredAddons.length > 0 && (
        <Stack gap={0}>
          {filteredAddons.map((addon: AddonMeta) => (
            <AddonItem
              key={addon.id}
              addon={addon}
              onSelect={() => onSelectAddon(addon)}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

const AddonDetailView: React.FunctionComponent<{
  addon: AddonMeta
  onBack: () => void
}> = ({ addon, onBack }) => {
  const functions = Object.entries(addon.functions ?? {})
  const secrets = Object.keys(addon.secrets ?? {})

  return (
    <Box>
      <BackButton
        title={addon.displayName}
        iconId={addon.id}
        onClick={onBack}
      />
      <Box
        p="md"
        className={classes.drawerButton}
      >
        <Text size="xs" c="dimmed">
          {addon.description}
        </Text>
        {secrets.length > 0 && (
          <Box mt="sm">
            <Text size="xs" fw={600} c="dimmed" mb="xs">
              Secrets
            </Text>
            <Stack gap="xs">
              {secrets.map((name) => (
                <Group key={name} gap="xs" wrap="nowrap">
                  <Key size={14} color="var(--mantine-color-default-border)" />
                  <Text size="xs">{name}</Text>
                </Group>
              ))}
            </Stack>
          </Box>
        )}
      </Box>
      <Stack gap={0}>
        {functions.map(([name, meta]: [string, any]) => (
          <NodeItem
            key={name}
            name={meta?.displayName ?? name}
            description={meta?.description ?? ''}
          />
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

  if (view === 'addons') {
    return (
      <AddonsView
        onBack={() => setView('main')}
        onSelectAddon={(addon) =>
          setView({ type: 'addonDetail', addon })
        }
      />
    )
  }

  if (typeof view === 'object' && view.type === 'addonDetail') {
    return (
      <AddonDetailView
        addon={view.addon}
        onBack={() => setView('addons')}
      />
    )
  }

  return (
    <Box>
      <Box
        p="md"
        className={classes.drawerButton}
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
          title="Addons"
          description="Third-party services and APIs"
          onClick={() => setView('addons')}
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
