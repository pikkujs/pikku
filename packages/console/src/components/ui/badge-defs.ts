import type { LucideIcon } from 'lucide-react'
import {
  Lock,
  Shield,
  Globe,
  EyeOff,
  Factory,
  Package,
  Server,
  Layers,
} from 'lucide-react'

export interface EnumBadgeDef {
  color: string
  label: string
}

export interface FlagBadgeDef {
  color: string
  label: string
  icon?: LucideIcon
}

export interface DynamicBadgeDef {
  color?: string
  variant?: string
  prefix?: string
  suffix?: string
  pluralSuffix?: string
  icon?: LucideIcon
}

export const httpMethodDefs: Record<string, EnumBadgeDef> = {
  GET: { color: 'blue', label: 'GET' },
  POST: { color: 'green', label: 'POST' },
  PUT: { color: 'yellow', label: 'PUT' },
  PATCH: { color: 'orange', label: 'PATCH' },
  DELETE: { color: 'red', label: 'DELETE' },
  HEAD: { color: 'gray', label: 'HEAD' },
  OPTIONS: { color: 'grape', label: 'OPTIONS' },
}

export const mcpTypeDefs: Record<string, EnumBadgeDef> = {
  resource: { color: 'blue', label: 'resource' },
  tool: { color: 'orange', label: 'tool' },
  prompt: { color: 'violet', label: 'prompt' },
}

export const funcWrapperDefs: Record<string, EnumBadgeDef> = {
  pikkuFunc: { label: 'Function', color: 'blue' },
  pikkuSessionlessFunc: { label: 'Function', color: 'blue' },
  pikkuVoidFunc: { label: 'Void', color: 'gray' },
  pikkuChannelFunc: { label: 'Channel', color: 'cyan' },
  pikkuChannelConnectionFunc: { label: 'Channel Connect', color: 'cyan' },
  pikkuChannelDisconnectionFunc: { label: 'Channel Disconnect', color: 'cyan' },
  pikkuMCPResourceFunc: { label: 'MCP Resource', color: 'orange' },
  pikkuMCPToolFunc: { label: 'MCP Tool', color: 'orange' },
  pikkuMCPPromptFunc: { label: 'MCP Prompt', color: 'orange' },
  pikkuTriggerFunc: { label: 'Trigger Source', color: 'yellow' },
  pikkuWorkflowFunc: { label: 'Workflow', color: 'violet' },
}

export const wiringTypeDefs: Record<string, EnumBadgeDef> = {
  http: { color: 'green', label: 'HTTP' },
  channel: { color: 'cyan', label: 'Channel' },
  mcp: { color: 'orange', label: 'MCP' },
  cli: { color: 'teal', label: 'CLI' },
  rpc: { color: 'indigo', label: 'RPC' },
  scheduler: { color: 'yellow', label: 'Scheduler' },
  queue: { color: 'pink', label: 'Queue' },
  trigger: { color: 'red', label: 'Trigger' },
  triggerSource: { color: 'grape', label: 'Trigger Source' },
  agent: { color: 'grape', label: 'Agent' },
}

export const schemaTypeDefs: Record<string, EnumBadgeDef> = {
  string: { color: 'green', label: 'string' },
  number: { color: 'blue', label: 'number' },
  integer: { color: 'blue', label: 'integer' },
  boolean: { color: 'orange', label: 'boolean' },
  array: { color: 'violet', label: 'array' },
  object: { color: 'cyan', label: 'object' },
  enum: { color: 'pink', label: 'enum' },
}

export const workflowInputTypeDefs: Record<string, EnumBadgeDef> = {
  $ref: { color: 'blue', label: '$ref' },
  $trigger: { color: 'green', label: '$trigger' },
  $state: { color: 'violet', label: '$state' },
  $template: { color: 'orange', label: '$template' },
  $static: { color: 'gray', label: '$static' },
  $expression: { color: 'cyan', label: '$expression' },
}

export const flagDefs: Record<string, FlagBadgeDef> = {
  auth: { color: 'red', label: 'Auth', icon: Lock },
  permissioned: { color: 'red', label: 'Permissioned', icon: Shield },
  exposed: { color: 'green', label: 'Exposed', icon: Globe },
  internal: { color: 'gray', label: 'Internal', icon: EyeOff },
  session: { color: 'yellow', label: 'Session', icon: Lock },
  factory: { color: 'violet', label: 'Factory', icon: Factory },
  factoryCall: { color: 'violet', label: 'factory call' },
  local: { color: 'orange', label: 'Local' },
  required: { color: 'red', label: 'required' },
  sse: { color: 'cyan', label: 'SSE' },
}

export const statusDefs: Record<string, EnumBadgeDef> = {
  running: { color: 'blue', label: 'running' },
  completed: { color: 'green', label: 'completed' },
  succeeded: { color: 'green', label: 'succeeded' },
  failed: { color: 'red', label: 'failed' },
  pending: { color: 'gray', label: 'pending' },
  scheduled: { color: 'orange', label: 'scheduled' },
  skipped: { color: 'gray', label: 'skipped' },
  cancelled: { color: 'gray', label: 'cancelled' },
}

export const dynamicDefs: Record<string, DynamicBadgeDef> = {
  route: { variant: 'outline' },
  param: { color: 'blue', variant: 'outline' },
  query: { color: 'green', variant: 'outline' },
  error: { color: 'red', variant: 'outline' },
  schedule: { color: 'yellow', variant: 'light' },
  concurrency: { color: 'pink', variant: 'light', prefix: 'concurrency: ' },
  steps: { variant: 'outline', suffix: ' step', pluralSuffix: ' steps' },
  wirings: {
    color: 'gray',
    variant: 'light',
    suffix: ' wiring',
    pluralSuffix: ' wirings',
  },
  functions: {
    variant: 'outline',
    suffix: ' function',
    pluralSuffix: ' functions',
  },
  tag: { variant: 'dot' },
  service: { color: 'gray', variant: 'light', icon: Server },
  package: { color: 'teal', variant: 'light', icon: Package },
  exportedName: { color: 'gray', variant: 'outline' },
  nodes: { variant: 'light', suffix: ' node', pluralSuffix: ' nodes' },
  middleware: { color: 'orange', variant: 'light', icon: Layers },
  permission: { color: 'red', variant: 'light', icon: Shield },
  source: { color: 'violet', variant: 'light' },
  handlers: {
    color: 'cyan',
    variant: 'outline',
    suffix: ' handler',
    pluralSuffix: ' handlers',
  },
  actions: {
    color: 'teal',
    variant: 'outline',
    suffix: ' action',
    pluralSuffix: ' actions',
  },
  tool: { color: 'blue', variant: 'outline' },
  agent: { color: 'grape', variant: 'outline' },
  agents: {
    color: 'grape',
    variant: 'outline',
    suffix: ' agent',
    pluralSuffix: ' agents',
  },
  tools: {
    color: 'blue',
    variant: 'outline',
    suffix: ' tool',
    pluralSuffix: ' tools',
  },
  maxSteps: {
    color: 'gray',
    variant: 'outline',
    prefix: 'max ',
    suffix: ' step',
    pluralSuffix: ' steps',
  },
  toolChoice: { color: 'gray', variant: 'outline', prefix: 'tool: ' },
  storage: { color: 'gray', variant: 'outline', prefix: 'storage: ' },
  lastMessages: {
    color: 'gray',
    variant: 'outline',
    prefix: 'last ',
    suffix: ' msg',
    pluralSuffix: ' msgs',
  },
  model: { color: 'violet', variant: 'light' },
  format: { color: 'gray', variant: 'outline' },
  wire: { color: 'cyan', variant: 'outline' },
}

export const wiringTypeColor = (type: string): string =>
  wiringTypeDefs[type]?.color || 'gray'
export const httpMethodColor = (method: string): string =>
  httpMethodDefs[method.toUpperCase()]?.color || 'gray'
export const funcWrapperColor = (wrapper: string): string =>
  funcWrapperDefs[wrapper]?.color || 'gray'
export const schemaTypeColor = (type: string): string =>
  schemaTypeDefs[type]?.color || 'gray'
