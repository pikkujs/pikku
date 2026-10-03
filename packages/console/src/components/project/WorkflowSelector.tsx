import React, { useMemo, useState } from 'react'
import {
  Box,
  Popover,
  TextInput,
  UnstyledButton,
  ScrollArea,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { ChevronDown, Search, Check } from 'lucide-react'
import { asI18n } from '@pikku/react'

export interface WorkflowSelectorItem {
  name: string
  description?: string
}

type WorkflowSelectorProps = {
  workflowName: string
  items: WorkflowSelectorItem[]
  onItemSelect: (name: string) => void
}

export const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({
  workflowName,
  items,
  onItemSelect,
}) => {
  const [opened, setOpened] = useState(false)
  const [search, setSearch] = useState('')

  const filteredItems = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
    )
  }, [items, search])

  const handleSelect = (name: string) => {
    setOpened(false)
    setSearch('')
    onItemSelect(name)
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={280}
      position="bottom-start"
      shadow="md"
      zIndex={10000}
    >
      <Popover.Target>
        <UnstyledButton
          px="sm"
          py={6}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 320,
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-sm)',
            background: 'var(--mantine-color-default)',
          }}
          onClick={() => setOpened((o) => !o)}
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
            {asI18n(workflowName)}
          </Text>
          <ChevronDown size={14} style={{ flexShrink: 0 }} />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <TextInput
          placeholder={asI18n('Search workflows...')}
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
                    item.name === workflowName
                      ? 'var(--mantine-color-green-light)'
                      : undefined,
                }}
              >
                {item.name === workflowName ? (
                  <Check size={14} color="var(--mantine-color-green-6)" />
                ) : (
                  <Box w={14} />
                )}
                <div>
                  <Text size="sm" fw={item.name === workflowName ? 500 : 400}>
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
                {asI18n('No results')}
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  )
}
