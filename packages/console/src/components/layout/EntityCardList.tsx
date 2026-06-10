import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Text, Stack, Group, Skeleton } from '@mantine/core'
import { EmptyStatePlaceholder } from './EmptyStatePlaceholder'
import { Boxes } from 'lucide-react'

export interface EntityCardBadge {
  label: string
  tone?: 'accent' | 'neutral'
}

export interface EntityCardItem {
  name: string
  badges?: EntityCardBadge[]
  meta?: string[]
  description?: string
  tags?: string[]
}

function EntityCard({
  item,
  onOpen,
  metricSlot,
}: {
  item: EntityCardItem
  onOpen: (name: string) => void
  metricSlot?: (name: string) => ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <Box
      onClick={() => onOpen(item.name)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--mantine-color-default-hover)' : 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'background 100ms',
        padding: '16px 20px',
        display: 'grid',
        gridTemplateColumns: metricSlot ? '1fr auto' : '1fr',
        gap: 24,
        alignItems: 'center',
      }}
    >
      <Stack gap={4} style={{ minWidth: 0 }}>
        <Group gap={8} wrap="nowrap" align="center">
          <Text size="sm" fw={500} ff="monospace" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </Text>
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            {item.meta?.map((m) => (
              <Box
                key={m}
                component="span"
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: 'var(--mantine-color-default)',
                  color: 'var(--mantine-color-dimmed)',
                  border: '1px solid var(--mantine-color-default-border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {m}
              </Box>
            ))}
            {item.badges?.map((b) => (
              <Box
                key={b.label}
                component="span"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 20,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  background:
                    b.tone === 'accent'
                      ? 'var(--mantine-color-blue-light)'
                      : 'var(--mantine-color-default)',
                  color:
                    b.tone === 'accent'
                      ? 'var(--mantine-color-blue-light-color)'
                      : 'var(--mantine-color-dimmed)',
                  border: '1px solid var(--mantine-color-default-border)',
                }}
              >
                {b.label}
              </Box>
            ))}
            {item.tags?.map((t) => (
              <Box
                key={t}
                component="span"
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--mantine-color-default)',
                  color: 'var(--mantine-color-dimmed)',
                  border: '1px solid var(--mantine-color-default-border)',
                }}
              >
                {t}
              </Box>
            ))}
          </Group>
        </Group>
        {item.description && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {item.description}
          </Text>
        )}
      </Stack>
      {metricSlot && <Box style={{ flexShrink: 0 }}>{metricSlot(item.name)}</Box>}
    </Box>
  )
}

interface EntityCardListProps {
  items: EntityCardItem[]
  onOpen: (name: string) => void
  loading?: boolean
  emptyHero?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  docsHref?: string
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
  metricSlot?: (name: string) => ReactNode
}

export const EntityCardList: React.FC<EntityCardListProps> = ({
  items,
  onOpen,
  loading = false,
  emptyHero,
  emptyTitle = 'No items found',
  emptyDescription,
  docsHref = 'https://pikku.dev/docs',
  icon = Boxes,
  metricSlot,
}) => {
  if (loading) {
    return (
      <Stack gap={10} p="md">
        <Skeleton height={78} radius={12} />
        <Skeleton height={78} radius={12} />
        <Skeleton height={78} radius={12} />
      </Stack>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={icon}
        hero={emptyHero}
        title={emptyTitle}
        description={emptyDescription}
        docsHref={docsHref}
      />
    )
  }

  return (
    <Stack gap={10}>
      {items.map((item) => (
        <EntityCard key={item.name} item={item} onOpen={onOpen} metricSlot={metricSlot} />
      ))}
    </Stack>
  )
}
