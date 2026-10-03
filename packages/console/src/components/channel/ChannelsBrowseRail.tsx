import React from 'react'
import {
  Paper,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ALL_CHANNELS, type ChannelsBrowse } from '../../hooks/useChannelsBrowse'
import {
  channelCountLabel,
  channelLabel,
  channelMessageCount,
} from './ChannelCards'

export interface ChannelsBrowseRailProps {
  browse: ChannelsBrowse
}

export const ChannelsBrowseRail: React.FC<ChannelsBrowseRailProps> = ({
  browse,
}) => {
  useLocale()
  const entries = Object.entries(browse.channels)
  const rows: { id: string; name: I18nNode; meta: I18nNode }[] = [
    {
      id: ALL_CHANNELS,
      name: m.channels_rail_all(),
      meta:
        entries.length === 1
          ? m.channels_rail_count_one()
          : m.channels_rail_count({ count: entries.length }),
    },
    ...entries.map(([name, channel]) => ({
      id: name,
      name: channelLabel(name, channel),
      meta: channelCountLabel(channelMessageCount(channel)),
    })),
  ]

  return (
    <ScrollArea h="100%" data-testid="channels-navigator">
      <Stack gap={8} p="md">
        {entries.length === 0 && (
          <Text size="sm" c="dimmed">
            {m.channels_rail_none()}
          </Text>
        )}
        {entries.length > 0 &&
          rows.map((row) => {
            const selected = row.id === browse.selectedName
            return (
              <UnstyledButton
                key={row.id}
                w="100%"
                data-selected={selected || undefined}
                data-testid={`channel-nav-${row.id}`}
                onClick={() => browse.setSelectedName(row.id)}
              >
                <Paper
                  variant={selected ? 'accent' : 'inset'}
                  radius="lg"
                  p={14}
                >
                  <Stack gap={4}>
                    <Text fw={600} lineClamp={2}>
                      {row.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {row.meta}
                    </Text>
                  </Stack>
                </Paper>
              </UnstyledButton>
            )
          })}
      </Stack>
    </ScrollArea>
  )
}
