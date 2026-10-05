import {
  ArrowDownRight,
  ArrowUpRight,
  BadgePercent,
  Coins,
  Receipt,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { Group, Paper, SimpleGrid, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './StatsGrid.module.css'

// One row per metric. Titles are UI copy (m.*); values are opaque data (asI18n),
// diff is a signed number. A real app maps live rows into this same shape.
type Stat = {
  title: () => I18nString
  icon: LucideIcon
  value: I18nString
  diff: number
}

const data: Stat[] = [
  { title: m.statsgrid__revenue, icon: Receipt, value: asI18n('13,456'), diff: 34 },
  { title: m.statsgrid__profit, icon: Coins, value: asI18n('4,145'), diff: -13 },
  { title: m.statsgrid__coupons, icon: BadgePercent, value: asI18n('745'), diff: 18 },
  { title: m.statsgrid__customers, icon: UserPlus, value: asI18n('188'), diff: -30 },
]

export function StatsGrid() {
  const stats = data.map((stat) => {
    const Icon = stat.icon
    const DiffIcon = stat.diff > 0 ? ArrowUpRight : ArrowDownRight

    return (
      <Paper withBorder p="md" radius="md" key={stat.title()}>
        <Group justify="space-between">
          <Text size="xs" c="dimmed" className={classes.title}>
            {stat.title()}
          </Text>
          <Icon className={classes.icon} size={22} strokeWidth={1.5} />
        </Group>

        <Group align="flex-end" gap="xs" mt={25}>
          <Text className={classes.value}>{stat.value}</Text>
          <Text c={stat.diff > 0 ? 'teal' : 'red'} fz="sm" fw={500} className={classes.diff}>
            <span>{asI18n(`${stat.diff}%`)}</span>
            <DiffIcon size={16} strokeWidth={1.5} />
          </Text>
        </Group>

        <Text fz="xs" c="dimmed" mt={7}>
          {m.statsgrid__compared()}
        </Text>
      </Paper>
    )
  })

  return (
    <div className={classes.root}>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>{stats}</SimpleGrid>
    </div>
  )
}
