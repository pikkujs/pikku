import { Card, Group, Image, RingProgress, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './CardWithStats.module.css'

export type CardStat = {
  title: I18nString
  // Opaque numeric value — asI18n(...), never translated.
  value: I18nString
}

export type CardWithStatsProps = {
  image?: string
  title?: I18nString
  completed?: number
  // Opaque metrics summary — asI18n(...).
  summary?: I18nString
  stats?: CardStat[]
}

export function CardWithStats({
  image = 'https://images.unsplash.com/photo-1581889470536-467bdbe30cd0?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
  title = m.cardwithstats__title(),
  completed = 80,
  summary = asI18n(
    '56 km this month • 17% improvement compared to last month • 443 place in global scoreboard',
  ),
  stats,
}: CardWithStatsProps = {}) {
  const data: CardStat[] = stats ?? [
    { title: m.cardwithstats__stat_distance(), value: asI18n('27.4 km') },
    { title: m.cardwithstats__stat_avg_speed(), value: asI18n('9.6 km/h') },
    { title: m.cardwithstats__stat_score(), value: asI18n('88/100') },
  ]

  const items = data.map((stat, i) => (
    <div key={i}>
      <Text size="xs" c="dimmed">
        {stat.title}
      </Text>
      <Text fw={500} size="sm">
        {stat.value}
      </Text>
    </div>
  ))

  return (
    <Card withBorder padding="lg" radius="md" className={classes.card}>
      <Card.Section>
        <Image src={image} alt={title} height={100} />
      </Card.Section>

      <Group justify="space-between" mt="lg">
        <Text className={classes.title}>{title}</Text>
        <Group gap={5}>
          <Text fz="xs" c="dimmed">
            {m.cardwithstats__completed({ percent: completed })}
          </Text>
          <RingProgress size={18} thickness={2} sections={[{ value: completed, color: 'blue' }]} />
        </Group>
      </Group>
      <Text mt="sm" mb="md" c="dimmed" fz="xs">
        {summary}
      </Text>
      <Card.Section className={classes.footer}>{items}</Card.Section>
    </Card>
  )
}
