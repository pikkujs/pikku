import { Bookmark, Heart, Share2 } from 'lucide-react'
import { ActionIcon, Avatar, Badge, Card, Group, Image, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './ArticleCard.module.css'

export type ArticleCardProps = {
  image?: string
  title?: I18nString
  description?: I18nString
  // Badge/rating label — UI copy.
  rating?: I18nString
  // Opaque author data — passed via asI18n(...), never translated.
  authorName?: I18nString
  authorAvatar?: string
  link?: string
}

export function ArticleCard({
  image = 'https://i.imgur.com/Cij5vdL.png',
  title = m.articlecard__title(),
  description = m.articlecard__description(),
  rating = m.articlecard__rating(),
  authorName = asI18n('Bill Wormeater'),
  authorAvatar = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-1.png',
  link = 'https://mantine.dev',
}: ArticleCardProps = {}) {
  return (
    <Card withBorder radius="md" className={classes.card}>
      <Card.Section component="a" href={link} target="_blank" rel="noreferrer">
        <Image src={image} height={180} alt={title} className={classes.image} />
      </Card.Section>

      <Badge
        className={classes.rating}
        variant="gradient"
        gradient={{ from: 'indigo', to: 'violet', deg: 145 }}
      >
        {rating}
      </Badge>

      <Text className={classes.title} component="a" href={link} target="_blank" rel="noreferrer">
        {title}
      </Text>

      <Text fz="sm" lineClamp={4} opacity={0.9}>
        {description}
      </Text>

      <Group justify="space-between" className={classes.footer}>
        <Group gap="xs">
          <Avatar src={authorAvatar} size={24} alt={authorName} />
          <Text fz="sm">{authorName}</Text>
        </Group>

        <Group gap={8}>
          <ActionIcon className={classes.action} aria-label={m.articlecard__like()}>
            <Heart size={16} color="var(--mantine-color-red-6)" />
          </ActionIcon>
          <ActionIcon className={classes.action} aria-label={m.articlecard__bookmark()}>
            <Bookmark size={16} color="var(--mantine-color-yellow-7)" />
          </ActionIcon>
          <ActionIcon className={classes.action} aria-label={m.articlecard__share()}>
            <Share2 size={16} color="var(--mantine-color-cyan-6)" />
          </ActionIcon>
        </Group>
      </Group>
    </Card>
  )
}
