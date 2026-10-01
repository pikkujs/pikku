import { Waves } from 'lucide-react'
import { Badge, Group, Paper, Progress, Text, ThemeIcon } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './StatsCard.module.css'

// Single progress card. Title/labels are UI copy (m.*); the metric readouts
// (distance, percent, deadline) are opaque data — asI18n(...) in a real app.
export function StatsCard() {
  return (
    <Paper radius="md" withBorder className={classes.card} mt={20}>
      <ThemeIcon className={classes.icon} size={60} radius={60}>
        <Waves size={32} strokeWidth={1.5} />
      </ThemeIcon>

      <Text ta="center" fw={700} className={classes.title}>
        {m.statscard__title()}
      </Text>
      <Text c="dimmed" ta="center" fz="sm">
        {asI18n('32 km / week')}
      </Text>

      <Group justify="space-between" mt="xs">
        <Text fz="sm" c="dimmed">
          {m.statscard__progress()}
        </Text>
        <Text fz="sm" c="dimmed">
          {asI18n('62%')}
        </Text>
      </Group>

      <Progress value={62} mt={5} aria-label={m.statscard__progress()} />

      <Group justify="space-between" mt="md">
        <Text fz="sm">{asI18n('20 / 36 km')}</Text>
        <Badge size="sm">{asI18n('4 days left')}</Badge>
      </Group>
    </Paper>
  )
}
