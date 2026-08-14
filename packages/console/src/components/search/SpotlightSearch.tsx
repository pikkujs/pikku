import React, { useMemo } from 'react'
import { useNavigate } from '../../router'
import type { SpotlightActionData } from '@mantine/spotlight'
import { Spotlight, spotlight } from '@mantine/spotlight'
import { useHotkeys } from '@mantine/hooks'
import {
  FunctionSquare,
  GitBranch,
  Globe,
  Radio,
  Cpu,
  Terminal,
  Clock,
  ListOrdered,
  Bot,
  Network,
  UserCog,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { useOptionalAuth } from '../../context/AuthContext'
import { useOptionalImpersonation } from '../../context/ImpersonationContext'
import { useDefaultNavSections, type NavSection } from '../project/Sidebar'

export interface SpotlightSearchProps {
  sections?: NavSection[]
}

const TYPE_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ size?: number }>; color: string; href: string }
> = {
  function: { icon: FunctionSquare, color: 'blue', href: '/functions' },
  workflow: { icon: GitBranch, color: 'violet', href: '/workflow' },
  http: { icon: Globe, color: 'green', href: '/apis?tab=http' },
  channel: { icon: Radio, color: 'cyan', href: '/apis?tab=channels' },
  mcp: { icon: Cpu, color: 'orange', href: '/apis?tab=mcp' },
  cli: { icon: Terminal, color: 'teal', href: '/apis?tab=cli' },
  gateway: { icon: Network, color: 'teal', href: '/apis?tab=gateways' },
  scheduler: { icon: Clock, color: 'yellow', href: '/jobs?tab=schedulers' },
  queue: { icon: ListOrdered, color: 'pink', href: '/jobs?tab=queues' },
  agent: { icon: Bot, color: 'grape', href: '/agents' },
}

export const SpotlightSearch: React.FC<SpotlightSearchProps> = ({
  sections: sectionsProp,
}) => {
  const { meta } = usePikkuMeta()
  const navigate = useNavigate()
  const auth = useOptionalAuth()
  const impersonation = useOptionalImpersonation()
  const defaultSections = useDefaultNavSections()
  const sections = sectionsProp ?? defaultSections
  const canImpersonate =
    (auth?.can('admin:impersonate') ?? false) && impersonation !== null

  const actions: SpotlightActionData[] = useMemo(() => {
    const items: SpotlightActionData[] = []

    sections.forEach((section) => {
      section.items.forEach((item) => {
        items.push({
          id: `nav-${item.href}`,
          label: item.label,
          description: section.title || undefined,
          leftSection: <item.icon size={16} />,
          onClick: () => navigate(item.href),
        })
      })
    })

    if (canImpersonate) {
      items.push({
        id: 'impersonate',
        label: m.impersonate_button(),
        description: m.spotlight_impersonate_description(),
        leftSection: <UserCog size={16} />,
        onClick: () => impersonation?.openPicker(),
      })
    }

    meta.functions?.forEach((func: any) => {
      items.push({
        id: `fn-${func.pikkuFuncId}`,
        label: func.pikkuFuncId,
        description: 'Function',
        leftSection: <FunctionSquare size={16} />,
        onClick: () => navigate('/functions'),
      })
    })

    if (meta.workflows) {
      for (const [name] of Object.entries(meta.workflows)) {
        items.push({
          id: `wf-${name}`,
          label: name,
          description: 'Workflow',
          leftSection: <GitBranch size={16} />,
          onClick: () => navigate(`/workflow?id=${encodeURIComponent(name)}`),
        })
      }
    }

    meta.httpMeta?.forEach((route: any) => {
      const label = `${route.method?.toUpperCase()} ${route.route}`
      items.push({
        id: `http-${label}`,
        label,
        description: `HTTP → ${route.pikkuFuncId || ''}`,
        leftSection: <Globe size={16} />,
        onClick: () => navigate('/apis?tab=http'),
      })
    })

    if (meta.channelsMeta) {
      for (const [channelName] of Object.entries(meta.channelsMeta)) {
        items.push({
          id: `ch-${channelName}`,
          label: channelName,
          description: 'Channel',
          leftSection: <Radio size={16} />,
          onClick: () => navigate('/apis?tab=channels'),
        })
      }
    }

    meta.mcpMeta?.forEach((item: any) => {
      items.push({
        id: `mcp-${item.wireId || item.name}`,
        label: item.name || item.wireId,
        description: `MCP ${item.method || ''}`,
        leftSection: <Cpu size={16} />,
        onClick: () => navigate('/apis?tab=mcp'),
      })
    })

    meta.gatewayMeta?.forEach((gateway: any) => {
      items.push({
        id: `gateway-${gateway.name}`,
        label: gateway.name,
        description: `Gateway ${gateway.type || ''}${gateway.platform ? ` (${gateway.platform})` : ''}`,
        leftSection: <Network size={16} />,
        onClick: () => navigate('/apis?tab=gateways'),
      })
    })

    meta.cliMeta?.forEach((program: any) => {
      const walkCommands = (commands: any, path: string) => {
        if (!commands) return
        for (const [cmdName, cmdData] of Object.entries(commands) as any[]) {
          const fullPath = path ? `${path} ${cmdName}` : cmdName
          if (cmdData.pikkuFuncId) {
            items.push({
              id: `cli-${program.wireId}-${fullPath}`,
              label: `${program.wireId} ${fullPath}`,
              description: `CLI → ${cmdData.pikkuFuncId}`,
              leftSection: <Terminal size={16} />,
              onClick: () => navigate('/apis?tab=cli'),
            })
          }
          if (cmdData.subcommands) walkCommands(cmdData.subcommands, fullPath)
        }
      }
      walkCommands(program.commands, '')
    })

    if (meta.schedulerMeta) {
      for (const [taskName, taskData] of Object.entries(
        meta.schedulerMeta
      ) as any[]) {
        items.push({
          id: `sched-${taskName}`,
          label: taskName,
          description: `Scheduler${taskData.schedule ? ` (${taskData.schedule})` : ''}`,
          leftSection: <Clock size={16} />,
          onClick: () => navigate('/jobs?tab=schedulers'),
        })
      }
    }

    if (meta.queueMeta) {
      for (const [workerName] of Object.entries(meta.queueMeta)) {
        items.push({
          id: `queue-${workerName}`,
          label: workerName,
          description: 'Queue Worker',
          leftSection: <ListOrdered size={16} />,
          onClick: () => navigate('/jobs?tab=queues'),
        })
      }
    }

    if (meta.agentsMeta) {
      for (const [agentName, agentData] of Object.entries(
        meta.agentsMeta
      ) as any[]) {
        items.push({
          id: `agent-${agentName}`,
          label: agentName,
          description: `Agent${agentData.model ? ` (${agentData.model})` : ''}`,
          leftSection: <Bot size={16} />,
          onClick: () => navigate('/agents'),
        })
      }
    }

    return items
  }, [meta, navigate, sections, canImpersonate, impersonation])

  // The empty tags list is the point: it defaults to INPUT, TEXTAREA and
  // SELECT, so ⌘K would be dead right after typing in a filter field.
  useHotkeys([['mod+K', () => spotlight.open()]], [])

  return (
    <Spotlight
      actions={actions}
      nothingFound="No results found"
      searchProps={{
        placeholder: 'Search functions, routes, workflows...',
      }}
      // Cap the results list so a long action list scrolls within the dialog
      // instead of running off the bottom of the screen.
      scrollable
      maxHeight={420}
      highlightQuery
    />
  )
}

export { spotlight }
