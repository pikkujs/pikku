import React from 'react'
import { Group, Paper, Stack, Text, Indicator, Badge } from '@mantine/core'
import { ArrowRight } from 'lucide-react'
import type { ChannelMeta } from '@pikku/core/channel'
import type { ChannelSelection } from './ChannelNavTree'

interface ChannelLifecycleBarProps {
  channel: ChannelMeta
  selected: ChannelSelection
  onSelectHandler: (handler: string) => void
}

const STAGES = [
  { key: 'connect', label: 'Connect' },
  { key: 'message', label: 'Message' },
  { key: 'disconnect', label: 'Disconnect' },
] as const

export const ChannelLifecycleBar: React.FunctionComponent<
  ChannelLifecycleBarProps
> = ({ channel, selected, onSelectHandler }) => {
  const messageActionCount = Object.values(channel.messageWirings || {}).reduce(
    (sum: number, actions: any) => sum + Object.keys(actions).length,
    0
  )

  return (
    <Group gap="xs">
      {STAGES.map((stage, i) => {
        const handler = channel[stage.key as 'connect' | 'disconnect' | 'message']
        const exists = handler != null
        const isSelected =
          selected?.type === 'handler' &&
          selected.handler === stage.key
        const funcId = handler?.pikkuFuncId

        return (
          <React.Fragment key={stage.key}>
            {i > 0 && (
              <ArrowRight
                size={14}
                color="var(--mantine-color-dimmed)"
              />
            )}
            <Paper
              withBorder
              p="xs"
              style={{
                cursor: exists ? 'pointer' : 'default',
                opacity: exists ? 1 : 0.5,
                borderColor: isSelected
                  ? 'var(--mantine-color-blue-6)'
                  : undefined,
                flex: 1,
              }}
              onClick={() => exists && onSelectHandler(stage.key)}
            >
              <Stack gap={2}>
                <Group gap="xs">
                  <Indicator
                    color={exists ? 'green' : 'gray'}
                    size={8}
                    processing={false}
                  >
                    <Text size="sm" fw={600}>
                      {stage.label}
                    </Text>
                  </Indicator>
                  {stage.key === 'message' && messageActionCount > 0 && (
                    <Badge size="xs" variant="light" color="teal" tt="none">
                      {messageActionCount} action{messageActionCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </Group>
                {funcId && (
                  <Text size="xs" c="dimmed" truncate>
                    {funcId}
                  </Text>
                )}
              </Stack>
            </Paper>
          </React.Fragment>
        )
      })}
    </Group>
  )
}
