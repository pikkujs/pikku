import React, { useState, useMemo } from 'react'
import { Box, Stack, TextInput, NavLink, Text, ScrollArea } from '@mantine/core'
import { Search } from 'lucide-react'
import type { ChannelMeta } from '@pikku/core/channel'

export type ChannelSelection =
  | { type: 'handler'; handler: string }
  | { type: 'action'; category: string; action: string }
  | null

interface ChannelNavTreeProps {
  channel: ChannelMeta
  selected: ChannelSelection
  onSelect: (item: ChannelSelection) => void
}

const HANDLER_KEYS = ['connect', 'disconnect', 'message'] as const

export const ChannelNavTree: React.FunctionComponent<ChannelNavTreeProps> = ({
  channel,
  selected,
  onSelect,
}) => {
  const [search, setSearch] = useState('')

  const categories = useMemo(
    () => Object.entries(channel.messageWirings || {}),
    [channel.messageWirings]
  )

  const query = search.toLowerCase()

  const filteredHandlers = useMemo(() => {
    if (!query) return HANDLER_KEYS
    return HANDLER_KEYS.filter((h) => h.toLowerCase().includes(query))
  }, [query])

  const filteredCategories = useMemo(() => {
    if (!query) return categories
    return categories
      .map(([cat, actions]) => {
        const catMatches = cat.toLowerCase().includes(query)
        if (catMatches) return [cat, actions] as const
        const filtered = Object.entries(actions).filter(([name]) =>
          name.toLowerCase().includes(query)
        )
        if (filtered.length === 0) return null
        return [cat, Object.fromEntries(filtered)] as const
      })
      .filter(Boolean) as [string, Record<string, any>][]
  }, [categories, query])

  const isHandlerActive = (h: string) =>
    selected?.type === 'handler' && selected.handler === h

  const isActionActive = (cat: string, action: string) =>
    selected?.type === 'action' &&
    selected.category === cat &&
    selected.action === action

  const isCategoryActive = (cat: string) =>
    selected?.type === 'action' && selected.category === cat

  const hasResults =
    filteredHandlers.length > 0 || filteredCategories.length > 0

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <Box
        px="sm"
        py="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <TextInput
          placeholder="Search handlers..."
          leftSection={<Search size={14} />}
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Box>
      <ScrollArea style={{ flex: 1 }} px="xs" py="xs">
        {filteredHandlers.map((h) => {
          const exists = channel[h] != null
          return (
            <NavLink
              key={h}
              label={
                <Text
                  size="sm"
                  fw={isHandlerActive(h) ? 600 : 400}
                  c={exists ? undefined : 'dimmed'}
                >
                  {h}
                </Text>
              }
              active={isHandlerActive(h)}
              disabled={!exists}
              onClick={() =>
                exists && onSelect({ type: 'handler', handler: h })
              }
              styles={{ root: { borderRadius: 4 } }}
            />
          )
        })}

        {filteredCategories.length > 0 && (
          <NavLink
            label={
              <Text size="sm" fw={600}>
                Message Wirings
              </Text>
            }
            defaultOpened
            styles={{ root: { borderRadius: 4 } }}
          >
            {filteredCategories.map(([category, actions]) => (
              <NavLink
                key={category}
                label={
                  <Text size="sm" fw={600}>
                    {category}
                  </Text>
                }
                defaultOpened
                opened={isCategoryActive(category) || undefined}
                styles={{ root: { borderRadius: 4 } }}
              >
                {Object.keys(actions).map((action) => (
                  <NavLink
                    key={action}
                    label={
                      <Text
                        size="sm"
                        fw={isActionActive(category, action) ? 600 : 400}
                      >
                        {action}
                      </Text>
                    }
                    active={isActionActive(category, action)}
                    onClick={() =>
                      onSelect({ type: 'action', category, action })
                    }
                    styles={{ root: { borderRadius: 4 } }}
                  />
                ))}
              </NavLink>
            ))}
          </NavLink>
        )}

        {search && !hasResults && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No results match &ldquo;{search}&rdquo;
          </Text>
        )}
      </ScrollArea>
    </Stack>
  )
}
