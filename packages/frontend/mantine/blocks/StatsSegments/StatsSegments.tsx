import { ArrowUpRight, ChartColumnBig } from 'lucide-react'
import { Box, Group, Paper, Progress, SimpleGrid, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './StatsSegments.module.css'

// Segment labels are UI copy (m.*); the counts/percentages are opaque data
// (asI18n). `color` is a Mantine theme colour that drives bar + accent.
type Segment = { label: () => I18nString; count: I18nString; part: number; color: string }

const data: Segment[] = [
  { label: m.statssegments__mobile, count: asI18n('204,001'), part: 59, color: 'teal' },
  { label: m.statssegments__desktop, count: asI18n('121,017'), part: 35, color: 'dark' },
  { label: m.statssegments__tablet, count: asI18n('31,118'), part: 6, color: 'cyan' },
]

export function StatsSegments() {
  const segments = data.map((segment) => (
    <Progress.Section
      value={segment.part}
      color={segment.color}
      key={segment.label()}
      aria-label={segment.label()}
    >
      {segment.part > 10 && <Progress.Label>{asI18n(`${segment.part}%`)}</Progress.Label>}
    </Progress.Section>
  ))

  const descriptions = data.map((stat) => (
    <Box
      key={stat.label()}
      style={{ borderBottomColor: `var(--mantine-color-${stat.color}-5)` }}
      className={classes.stat}
    >
      <Text tt="uppercase" fz="xs" c="dimmed" fw={700}>
        {stat.label()}
      </Text>

      <Group justify="space-between" align="flex-end" gap={0}>
        <Text fw={700}>{stat.count}</Text>
        <Text c={stat.color} fw={700} size="sm" className={classes.statCount}>
          {asI18n(`${stat.part}%`)}
        </Text>
      </Group>
    </Box>
  ))

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between">
        <Group align="flex-end" gap="xs">
          <Text fz="xl" fw={700}>
            {asI18n('345,765')}
          </Text>
          <Text c="teal" className={classes.diff} fz="sm" fw={700}>
            <span>{asI18n('18%')}</span>
            <ArrowUpRight size={16} style={{ marginBottom: 4 }} strokeWidth={1.5} />
          </Text>
        </Group>
        <ChartColumnBig size={22} className={classes.icon} strokeWidth={1.5} />
      </Group>

      <Text c="dimmed" fz="sm">
        {m.statssegments__caption()}
      </Text>

      <Progress.Root size={34} classNames={{ label: classes.progressLabel }} mt={40}>
        {segments}
      </Progress.Root>
      <SimpleGrid cols={{ base: 1, xs: 3 }} mt="xl">
        {descriptions}
      </SimpleGrid>
    </Paper>
  )
}
