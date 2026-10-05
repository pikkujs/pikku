import { Heart } from 'lucide-react'
import { ActionIcon, Badge, Button, Card, Group, Image, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './BadgeCard.module.css'

export type BadgeItem = {
  emoji: string
  label: I18nString
}

export type BadgeCardProps = {
  image?: string
  title?: I18nString
  country?: I18nString
  description?: I18nString
  badges?: BadgeItem[]
}

export function BadgeCard({
  image = 'https://images.unsplash.com/photo-1437719417032-8595fd9e9dc6?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&q=80',
  title = m.badgecard__title(),
  country = m.badgecard__country(),
  description = m.badgecard__description(),
  badges,
}: BadgeCardProps = {}) {
  const data: BadgeItem[] = badges ?? [
    { emoji: '☀️', label: m.badgecard__badge_sunny() },
    { emoji: '🦓', label: m.badgecard__badge_zoo() },
    { emoji: '🌊', label: m.badgecard__badge_sea() },
    { emoji: '🌲', label: m.badgecard__badge_nature() },
    { emoji: '🤽', label: m.badgecard__badge_water_sports() },
  ]

  const features = data.map((badge, i) => (
    <Badge variant="light" key={i} leftSection={badge.emoji}>
      {badge.label}
    </Badge>
  ))

  return (
    <Card withBorder radius="md" p="md" className={classes.card}>
      <Card.Section>
        <Image src={image} alt={title} height={180} />
      </Card.Section>

      <Card.Section className={classes.section} mt="md">
        <Group justify="space-between">
          <Text fz="lg" fw={500}>
            {title}
          </Text>
          <Badge size="sm" variant="light">
            {country}
          </Badge>
        </Group>
        <Text fz="sm" mt="xs">
          {description}
        </Text>
      </Card.Section>

      <Card.Section className={classes.section}>
        <Text mt="md" className={classes.label} c="dimmed">
          {m.badgecard__perfect_for()}
        </Text>
        <Group gap={7} mt={5}>
          {features}
        </Group>
      </Card.Section>

      <Group mt="xs">
        <Button radius="md" style={{ flex: 1 }}>
          {m.badgecard__show_details()}
        </Button>
        <ActionIcon variant="default" radius="md" size={36} aria-label={m.badgecard__like()}>
          <Heart className={classes.like} strokeWidth={1.5} />
        </ActionIcon>
      </Group>
    </Card>
  )
}
