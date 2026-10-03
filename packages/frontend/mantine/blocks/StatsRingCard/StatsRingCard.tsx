import { Card, Group, RingProgress, Text, useMantineTheme } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './StatsRingCard.module.css'

// Breakdown labels are UI copy (m.*); the counts are opaque data (asI18n). The
// completed/total figures drive the ring; a real app feeds them live.
type Item = { value: I18nString; label: () => I18nString }

const items: Item[] = [
  { value: asI18n('447'), label: m.statsringcard__remaining },
  { value: asI18n('76'), label: m.statsringcard__in_progress },
]

export function StatsRingCard() {
  const theme = useMantineTheme()
  const completed = 1887
  const total = 2334
  const percent = ((completed / total) * 100).toFixed(0)

  const rows = items.map((item) => (
    <div key={item.label()}>
      <Text className={classes.label}>{item.value}</Text>
      <Text size="xs" c="dimmed">
        {item.label()}
      </Text>
    </div>
  ))

  return (
    <Card withBorder p="xl" radius="md" className={classes.card}>
      <div className={classes.inner}>
        <div>
          <Text fz="xl" className={classes.label}>
            {m.statsringcard__title()}
          </Text>
          <div>
            <Text className={classes.lead} mt={30}>
              {asI18n(String(completed))}
            </Text>
            <Text fz="xs" c="dimmed">
              {m.statsringcard__completed()}
            </Text>
          </div>
          <Group mt="lg">{rows}</Group>
        </div>

        <div className={classes.ring}>
          <RingProgress
            roundCaps
            thickness={6}
            size={150}
            sections={[{ value: (completed / total) * 100, color: theme.primaryColor }]}
            label={
              <div>
                <Text ta="center" fz="lg" className={classes.label}>
                  {asI18n(`${percent}%`)}
                </Text>
                <Text ta="center" fz="xs" c="dimmed">
                  {m.statsringcard__completed()}
                </Text>
              </div>
            }
          />
        </div>
      </div>
    </Card>
  )
}
