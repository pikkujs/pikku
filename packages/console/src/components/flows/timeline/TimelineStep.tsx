import React from 'react'
import { Box, Group, Stack, Text, Badge } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import {
  MousePointerClick,
  Hourglass,
  Flag,
  GitFork,
  Network,
  Circle,
  Check,
  X,
  Loader,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PersonaAvatar } from '../../personas/PersonaAvatar'
import type { PersonaRef } from '../../personas/persona-types'
import { summarizeArgs } from './timeline-model'
import type { FlowTimelineNode } from './timeline-model'

const KIND_STYLE: Record<
  FlowTimelineNode['kind'],
  { Icon: LucideIcon; color: string; badge: string }
> = {
  rpc: { Icon: MousePointerClick, color: 'green', badge: 'RPC' },
  eventual: { Icon: Hourglass, color: 'yellow', badge: 'EVENTUAL' },
  return: { Icon: Flag, color: 'gray', badge: 'RETURN' },
  parallel: { Icon: GitFork, color: 'blue', badge: 'PARALLEL' },
  fanout: { Icon: Network, color: 'blue', badge: 'FANOUT' },
  other: { Icon: Circle, color: 'gray', badge: 'STEP' },
}

const statusChip = (
  status?: string
): { color: string; label: string; Icon: LucideIcon } | undefined => {
  switch (status) {
    case 'succeeded':
    case 'completed':
      return { color: 'green', label: 'pass', Icon: Check }
    case 'failed':
    case 'cancelled':
      return { color: 'red', label: 'fail', Icon: X }
    case 'running':
      return { color: 'blue', label: 'running', Icon: Loader }
    default:
      return undefined
  }
}

type TimelineStepProps = {
  node: FlowTimelineNode
  actor?: PersonaRef
  status?: string
  isLast?: boolean
}

export const TimelineStep: React.FC<TimelineStepProps> = ({
  node,
  actor,
  status,
  isLast = false,
}) => {
  const style = KIND_STYLE[node.kind]
  const chip = statusChip(status)
  const args = summarizeArgs(node.args)

  return (
    <Group align="stretch" gap={16} wrap="nowrap">
      <Box style={{ position: 'relative', width: 40, flexShrink: 0 }}>
        {!isLast && (
          <Box
            style={{
              position: 'absolute',
              left: 19,
              top: 22,
              bottom: -18,
              width: 2,
              background: 'var(--mantine-color-default-border)',
            }}
          />
        )}
        <Box
          style={{
            position: 'relative',
            zIndex: 1,
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: `var(--mantine-color-${style.color}-light)`,
            color: `var(--mantine-color-${style.color}-light-color)`,
            border: `1px solid var(--mantine-color-${style.color}-outline, var(--mantine-color-default-border))`,
          }}
        >
          <style.Icon size={19} strokeWidth={1.8} />
        </Box>
      </Box>
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          marginBottom: 18,
          background: 'var(--app-surface, var(--mantine-color-body))',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 12,
          padding: '14px 16px',
        }}
      >
        <Group gap={10} wrap="nowrap" align="center">
          {actor ? (
            <Group gap={8} wrap="nowrap">
              <PersonaAvatar
                personaKey={actor.key}
                jobTitle={actor.jobTitle}
                name={actor.name}
                size={22}
              />
              <Text size="sm" fw={500}>
                {asI18n(actor.name ?? actor.key)}
              </Text>
            </Group>
          ) : (
            <Badge variant="light" color={style.color} radius="sm" tt="none">
              {asI18n(style.badge)}
            </Badge>
          )}
          <Box style={{ flex: 1 }} />
          {chip ? (
            <Badge
              variant="light"
              color={chip.color}
              radius="sm"
              tt="none"
              leftSection={<chip.Icon size={11} strokeWidth={2.4} />}
            >
              {asI18n(chip.label)}
            </Badge>
          ) : (
            <Badge variant="light" color={style.color} radius="sm" tt="none">
              {asI18n(style.badge)}
            </Badge>
          )}
        </Group>
        <Text size="sm" fw={500} mt={9} c="var(--mantine-color-text)">
          {asI18n(node.title)}
        </Text>
        {node.rpcName && (
          <Text size="xs" ff="monospace" c="dimmed" mt={4}>
            {asI18n(`${node.rpcName}(${args})`)}
          </Text>
        )}
      </Box>
    </Group>
  )
}
