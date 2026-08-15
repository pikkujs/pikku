import React, { useMemo, useState } from 'react'
import {
  Box,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useAgentPlaygroundSurface } from '../../context/AgentPlaygroundSurfaceContext'

/**
 * Names the surface's agent and, where the host supplied a list, switches to
 * another one.
 */
export const AgentSelector: React.FC = () => {
  useLocale()
  const { agentId, agentItems, onAgentSelect } = useAgentPlaygroundSurface()
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredItems = useMemo(() => {
    if (!search) return agentItems
    const q = search.toLowerCase()
    return agentItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
    )
  }, [agentItems, search])

  const handleSelect = (name: string) => {
    setSelectorOpen(false)
    setSearch('')
    onAgentSelect?.(name)
  }

  return (
    <Popover
      opened={selectorOpen}
      onChange={setSelectorOpen}
      width={280}
      position="bottom-start"
      shadow="md"
      zIndex={10000}
    >
      <Popover.Target>
        <UnstyledButton
          px="xs"
          py={4}
          style={{
            maxWidth: 260,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            borderRadius: 6,
          }}
          onClick={() => setSelectorOpen((o) => !o)}
        >
          <Text
            size="sm"
            fw={600}
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {asI18n(agentId)}
          </Text>
          <ChevronDown size={14} style={{ flexShrink: 0 }} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <TextInput
          placeholder={m.agent_playground_search_agents()}
          leftSection={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{
            input: {
              border: 'none',
              borderBottom: '1px solid var(--mantine-color-default-border)',
              borderRadius: 0,
            },
          }}
        />
        <ScrollArea.Autosize mah={300}>
          <Stack gap={0}>
            {filteredItems.map((item) => (
              <UnstyledButton
                key={item.name}
                onClick={() => handleSelect(item.name)}
                py="xs"
                px="sm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor:
                    item.name === agentId
                      ? 'var(--mantine-color-green-light)'
                      : undefined,
                }}
              >
                {item.name === agentId ? (
                  <Check size={14} color="var(--mantine-color-green-6)" />
                ) : (
                  <Box w={14} />
                )}
                <div>
                  <Text size="sm" fw={item.name === agentId ? 500 : 400}>
                    {asI18n(item.name)}
                  </Text>
                  {item.description && (
                    <Text size="sm" c="dimmed">
                      {asI18n(item.description)}
                    </Text>
                  )}
                </div>
              </UnstyledButton>
            ))}
            {filteredItems.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {m.common_no_results()}
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  )
}
