import React, { useState, useMemo } from 'react'
import { Box, Text, TextInput, ScrollArea, Group, Badge, UnstyledButton } from '@mantine/core'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import type { ChannelMeta } from '@pikku/core/channel'

export type ChannelSelection =
  | { type: 'handler'; handler: string }
  | { type: 'action'; category: string; action: string }
  | null

interface ChannelNavTreeProps {
  channelName: string
  channel: ChannelMeta
  allChannelsMeta: Record<string, ChannelMeta>
  selected: ChannelSelection
  onSelect: (item: ChannelSelection) => void
  onChannelSwitch: (name: string) => void
}

const HANDLER_KEYS = ['connect', 'disconnect'] as const

const ChannelTree: React.FunctionComponent<{
  name: string
  channel: ChannelMeta
  isActive: boolean
  isExpanded: boolean
  onToggle: () => void
  selected: ChannelSelection
  onSelect: (item: ChannelSelection) => void
  onChannelSwitch: (name: string) => void
}> = ({ name, channel, isActive, isExpanded, onToggle, selected, onSelect, onChannelSwitch }) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(Object.keys(channel.messageWirings || {}))
  )
  const categories = Object.entries(channel.messageWirings || {})

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const isHandlerActive = (h: string) =>
    isActive && selected?.type === 'handler' && selected.handler === h

  const isActionActive = (cat: string, action: string) =>
    isActive && selected?.type === 'action' && selected.category === cat && selected.action === action

  return (
    <>
      <UnstyledButton
        onClick={() => {
          if (isActive) {
            onToggle()
          } else {
            if (!isExpanded) onToggle()
            onChannelSwitch(name)
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          fontSize: 11,
          color: isActive ? 'var(--app-meta-value)' : 'var(--app-text)',
          borderLeft: isActive ? '2px solid rgba(6,182,212,0.4)' : '2px solid transparent',
          width: '100%',
          opacity: isActive ? 1 : 0.6,
          cursor: 'pointer',
        }}
      >
        {isExpanded ? (
          <ChevronDown size={9} color="var(--app-section-label)" />
        ) : (
          <ChevronRight size={9} color="var(--app-section-label)" />
        )}
        <Text size="xs" ff="monospace" style={{ flex: 1 }}>
          {name}
        </Text>
        <Badge size="xs" variant="light" color="cyan" ff="monospace">
          ws
        </Badge>
      </UnstyledButton>

      {isExpanded && (
        <>
          {HANDLER_KEYS.map((h) => {
            const exists = channel[h] != null
            const active = isHandlerActive(h)
            return (
              <UnstyledButton
                key={h}
                onClick={() => exists && onSelect({ type: 'handler', handler: h })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 12px 5px 22px',
                  fontSize: 10,
                  color: active ? 'var(--app-meta-value)' : exists ? 'var(--app-text)' : 'var(--app-text-muted)',
                  borderLeft: active ? '2px solid #7c3aed' : '2px solid transparent',
                  background: active ? 'rgba(124,58,237,0.06)' : undefined,
                  width: '100%',
                  cursor: exists ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                <Box
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: h === 'connect' ? 'rgba(6,182,212,0.6)' : 'rgba(239,68,68,0.5)',
                  }}
                />
                <Text size="xs" ff="monospace">
                  {h === 'connect' ? 'onConnect' : 'onDisconnect'}
                </Text>
              </UnstyledButton>
            )
          })}

          {categories.map(([category, actions]) => {
            const actionEntries = Object.entries(actions)
            const isCatExpanded = expandedCategories.has(category)

            return (
              <React.Fragment key={category}>
                <UnstyledButton
                  onClick={() => toggleCategory(category)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px 4px 22px',
                    fontSize: 10,
                    color: 'var(--app-text)',
                    width: '100%',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {isCatExpanded ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
                  <Text size="xs" ff="monospace" c="var(--app-meta-label)">
                    {category}
                  </Text>
                  <Badge
                    size="xs"
                    ff="monospace"
                    tt="none"
                    style={{
                      background: 'rgba(124,58,237,0.08)',
                      border: '0.5px solid rgba(124,58,237,0.18)',
                      color: '#7c3aed',
                    }}
                  >
                    routing
                  </Badge>
                </UnstyledButton>

                {isCatExpanded &&
                  actionEntries.map(([action]) => {
                    const active = isActionActive(category, action)
                    const actionMeta = actions[action]
                    const funcName = actionMeta?.pikkuFuncId || action
                    return (
                      <UnstyledButton
                        key={action}
                        onClick={() => onSelect({ type: 'action', category, action })}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 7,
                          padding: '5px 12px 5px 32px',
                          borderLeft: active ? '2px solid #7c3aed' : '2px solid transparent',
                          background: active ? 'rgba(124,58,237,0.06)' : undefined,
                          width: '100%',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            size="xs"
                            ff="monospace"
                            fw={active ? 600 : 400}
                            c={active ? 'var(--app-meta-value)' : 'var(--app-text)'}
                            truncate
                          >
                            {action}
                          </Text>
                          <Text
                            size="xs"
                            ff="monospace"
                            c={active ? 'var(--app-meta-label)' : 'var(--app-text-muted)'}
                            truncate
                            style={{ fontSize: 9 }}
                          >
                            {funcName}()
                          </Text>
                        </Box>
                      </UnstyledButton>
                    )
                  })}
              </React.Fragment>
            )
          })}
        </>
      )}
    </>
  )
}

export const ChannelNavTree: React.FunctionComponent<ChannelNavTreeProps> = ({
  channelName,
  channel,
  allChannelsMeta,
  selected,
  onSelect,
  onChannelSwitch,
}) => {
  const [search, setSearch] = useState('')
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(
    () => new Set([channelName])
  )

  const channelEntries = useMemo(
    () => Object.entries(allChannelsMeta),
    [allChannelsMeta]
  )

  const toggleChannel = (name: string) => {
    setExpandedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const channelCount = channelEntries.length

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box p="xs">
        <Group justify="space-between" mb={6}>
          <Text size="xs" fw={600} ff="monospace" c="var(--app-meta-label)">
            Channels
          </Text>
          <Text size="xs" ff="monospace" c="dimmed">
            {channelCount} {channelCount === 1 ? 'channel' : 'channels'}
          </Text>
        </Group>
        <TextInput
          placeholder="Search..."
          leftSection={<Search size={14} />}
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Box>
      <ScrollArea style={{ flex: 1 }}>
        {channelEntries.map(([name, chMeta]) => (
          <ChannelTree
            key={name}
            name={name}
            channel={chMeta as ChannelMeta}
            isActive={name === channelName}
            isExpanded={expandedChannels.has(name)}
            onToggle={() => toggleChannel(name)}
            selected={selected}
            onSelect={(sel) => {
              if (name !== channelName) {
                onChannelSwitch(name)
              }
              onSelect(sel)
            }}
            onChannelSwitch={onChannelSwitch}
          />
        ))}
      </ScrollArea>
    </Box>
  )
}
