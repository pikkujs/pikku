import type { I18nString } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { wiringTypeDefs } from '../ui/badge-defs'

export type FunctionKind =
  'function' | 'assistant' | 'channel' | 'workflow' | 'trigger'

const KIND_BY_WRAPPER: Record<string, FunctionKind> = {
  pikkuFunc: 'function',
  pikkuSessionlessFunc: 'function',
  pikkuVoidFunc: 'function',
  pikkuChannelFunc: 'channel',
  pikkuChannelConnectionFunc: 'channel',
  pikkuChannelDisconnectionFunc: 'channel',
  pikkuMCPResourceFunc: 'assistant',
  pikkuMCPToolFunc: 'assistant',
  pikkuMCPPromptFunc: 'assistant',
  pikkuTriggerFunc: 'trigger',
  pikkuWorkflowFunc: 'workflow',
}

export const KIND_ORDER: FunctionKind[] = [
  'function',
  'assistant',
  'channel',
  'workflow',
  'trigger',
]

export const kindLabel = (kind: FunctionKind): I18nString =>
  ({
    function: m.functions_kind_function(),
    assistant: m.functions_kind_assistant(),
    channel: m.functions_kind_channel(),
    workflow: m.functions_kind_workflow(),
    trigger: m.functions_kind_trigger(),
  })[kind]

export const reachLabel = (type: string): I18nString => {
  switch (type) {
    case 'http':
      return m.functions_reach_http()
    case 'cli':
      return m.functions_reach_cli()
    case 'mcp':
      return m.functions_reach_mcp()
    case 'channel':
      return m.functions_reach_channel()
    case 'gateway':
      return m.functions_reach_gateway()
    case 'scheduler':
      return m.functions_reach_scheduler()
    case 'queue':
      return m.functions_reach_queue()
    case 'trigger':
      return m.functions_reach_trigger()
    case 'agent':
      return m.functions_reach_agent()
    case 'app':
      return m.functions_reach_app()
    default:
      return asI18n(wiringTypeDefs[type]?.label ?? type)
  }
}

export const kindOf = (func: any): FunctionKind =>
  KIND_BY_WRAPPER[func?.funcWrapper] ?? 'function'

export const REACH_HREF: Record<string, string> = {
  http: '/wires/http',
  channel: '/wires/channel',
  mcp: '/wires/mcp',
  gateway: '/wires/gateway',
  cli: '/wires/cli',
  scheduler: '/async/scheduler',
  queue: '/async/queue',
  trigger: '/async/trigger',
  agent: '/agents',
}
