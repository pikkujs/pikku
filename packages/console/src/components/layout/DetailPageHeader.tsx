import React, { useState, useMemo } from 'react'
import { useLink } from '../../router'
import {
  Group,
  Text,
  Popover,
  TextInput,
  Stack,
  UnstyledButton,
  ScrollArea,
  Box,
  Tooltip,
  ActionIcon,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Search, ChevronDown, Check, ExternalLink } from 'lucide-react'
import classes from '../ui/console.module.css'

interface SwitcherItem {
  name: string
  description?: string
}

interface DetailPageHeaderProps {
  icon: React.ComponentType<{ size?: number }>
  category: string
  docsHref: string
  categoryPath?: string
  currentItem?: string
  items?: SwitcherItem[]
  onItemSelect?: (name: string) => void
  subtitle?: React.ReactNode
  tabs?: React.ReactNode
  rightSection?: React.ReactNode
}

export const DetailPageHeader: React.FC<DetailPageHeaderProps> = ({
  icon: Icon,
  category,
  docsHref,
  categoryPath,
  currentItem,
  items,
  onItemSelect,
  subtitle,
  tabs,
  rightSection,
}) => {
  const Link = useLink()
  useLocale()
  const [opened, setOpened] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!items) return []
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    )
  }, [items, search])

  const handleSelect = (name: string) => {
    setOpened(false)
    setSearch('')
    onItemSelect?.(name)
  }

  return (
    <Group
      gap="xs"
      px="md"
      h={50}
      className={classes.noShrink}
      style={{
        zIndex: 9999,
        borderBottom: '1px solid var(--mantine-color-default-border)',
        backgroundColor: 'var(--mantine-color-body)',
      }}
    >
      {categoryPath ? (
        <Link to={categoryPath} style={{ textDecoration: 'none' }}>
          <Text size="md" c="dimmed">
            {asI18n(category)}
          </Text>
        </Link>
      ) : currentItem ? (
        <Text size="md" c="dimmed">
          {asI18n(category)}
        </Text>
      ) : null}

      {currentItem && !items && (
        <>
          <Text size="md" c="dimmed">
            {m.detail_header_separator()}
          </Text>
          <Text size="md" fw={500}>
            {asI18n(currentItem)}
          </Text>
        </>
      )}

      {currentItem && items && onItemSelect && (
        <>
          <Text size="md" c="dimmed">
            {m.detail_header_separator()}
          </Text>
          <Popover
            opened={opened}
            onChange={setOpened}
            width={300}
            position="bottom-start"
            shadow="md"
            zIndex={10000}
          >
            <Popover.Target>
              <UnstyledButton
                onClick={() => setOpened((o) => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Text size="md" fw={500}>
                  {asI18n(currentItem)}
                </Text>
                <ChevronDown size={14} />
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              <TextInput
                placeholder={asI18n(`Search ${category.toLowerCase()}...`)}
                leftSection={<Search size={14} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                styles={{
                  input: {
                    border: 'none',
                    borderBottom:
                      '1px solid var(--mantine-color-default-border)',
                    borderRadius: 0,
                  },
                }}
              />
              <ScrollArea.Autosize mah={300}>
                <Stack gap={0}>
                  {filtered.map((item) => (
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
                          item.name === currentItem
                            ? 'var(--mantine-color-green-light)'
                            : undefined,
                      }}
                    >
                      {item.name === currentItem && (
                        <Check size={14} color="var(--mantine-color-green-6)" />
                      )}
                      <div
                        style={{
                          marginLeft: item.name === currentItem ? 0 : 22,
                        }}
                      >
                        <Text
                          size="sm"
                          fw={item.name === currentItem ? 500 : 400}
                        >
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
                  {filtered.length === 0 && (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      {m.detail_header_no_results()}
                    </Text>
                  )}
                </Stack>
              </ScrollArea.Autosize>
            </Popover.Dropdown>
          </Popover>
        </>
      )}

      {subtitle}

      {tabs && <Box ml="md">{tabs}</Box>}

      <Group ml="auto" gap="sm">
        {rightSection}
        <Tooltip label={asI18n(`${category} docs`)}>
          <ActionIcon
            component="a"
            href={docsHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            color="gray"
            size="sm"
          >
            <ExternalLink size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}
