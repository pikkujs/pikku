import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Group, Paper, SimpleGrid, Text, ThemeIcon } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './StatsGridIcons.module.css'

// Titles are UI copy (m.*); the money/count values are opaque data (asI18n).
type Stat = { title: () => I18nString; value: I18nString; diff: number }

const data: Stat[] = [
  { title: m.statsgridicons__revenue, value: asI18n('$13,456'), diff: 34 },
  { title: m.statsgridicons__profit, value: asI18n('$4,145'), diff: -13 },
  { title: m.statsgridicons__coupons, value: asI18n('745'), diff: 18 },
]

export function StatsGridIcons() {
  const stats = data.map((stat) => {
    const DiffIcon = stat.diff > 0 ? ArrowUpRight : ArrowDownRight

    return (
      <Paper withBorder p="md" radius="md" key={stat.title()}>
        <Group justify="space-between">
          <div>
            <Text c="dimmed" tt="uppercase" fw={700} fz="xs">
              {stat.title()}
            </Text>
            <Text fw={700} fz="xl">
              {stat.value}
            </Text>
          </div>
          <ThemeIcon
            color="gray"
            variant="light"
            style={{
              color: stat.diff > 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)',
            }}
            size={38}
            radius="md"
          >
            <DiffIcon size={28} strokeWidth={1.5} />
          </ThemeIcon>
        </Group>
        <Text c="dimmed" fz="sm" mt="md">
          <Text component="span" c={stat.diff > 0 ? 'teal' : 'red'} fw={700}>
            {asI18n(`${stat.diff}%`)}
          </Text>
          {asI18n(' ')}
          {stat.diff > 0 ? m.statsgridicons__increase() : m.statsgridicons__decrease()}
        </Text>
      </Paper>
    )
  })

  return (
    <div className={classes.root}>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>{stats}</SimpleGrid>
    </div>
  )
}
