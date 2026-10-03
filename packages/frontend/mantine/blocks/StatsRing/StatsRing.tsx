import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Center, Group, Paper, RingProgress, SimpleGrid, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'

// Labels are UI copy (m.*); the figures are opaque data (asI18n); progress/color
// drive the ring. A real app maps live rows into this same shape.
type Stat = {
  label: () => I18nString
  stats: I18nString
  progress: number
  color: string
  icon: LucideIcon
}

const data: Stat[] = [
  {
    label: m.statsring__pageviews,
    stats: asI18n('456,578'),
    progress: 65,
    color: 'teal',
    icon: ArrowUpRight,
  },
  {
    label: m.statsring__newusers,
    stats: asI18n('2,550'),
    progress: 72,
    color: 'blue',
    icon: ArrowUpRight,
  },
  {
    label: m.statsring__orders,
    stats: asI18n('4,735'),
    progress: 52,
    color: 'red',
    icon: ArrowDownRight,
  },
]

export function StatsRing() {
  const stats = data.map((stat) => {
    const Icon = stat.icon
    return (
      <Paper withBorder radius="md" p="xs" key={stat.label()}>
        <Group>
          <RingProgress
            size={80}
            roundCaps
            thickness={8}
            sections={[{ value: stat.progress, color: stat.color }]}
            label={
              <Center>
                <Icon size={20} strokeWidth={1.5} />
              </Center>
            }
          />

          <div>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {stat.label()}
            </Text>
            <Text fw={700} size="xl">
              {stat.stats}
            </Text>
          </div>
        </Group>
      </Paper>
    )
  })

  return <SimpleGrid cols={{ base: 1, sm: 3 }}>{stats}</SimpleGrid>
}
