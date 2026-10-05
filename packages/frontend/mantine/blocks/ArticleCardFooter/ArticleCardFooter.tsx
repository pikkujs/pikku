import { Bookmark, Heart, Share2 } from 'lucide-react'
import { ActionIcon, Avatar, Badge, Card, Group, Image, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './ArticleCardFooter.module.css'

export type ArticleCardFooterProps = {
  category?: I18nString
  title?: I18nString
  image?: string
  // Opaque data — asI18n(...), never translated.
  authorName?: I18nString
  authorAvatar?: string
  postedTime?: I18nString
  footer?: I18nString
}

export function ArticleCardFooter({
  category = m.articlecardfooter__category(),
  title = m.articlecardfooter__title(),
  image = 'https://images.unsplash.com/photo-1483794344563-d27a8d18014e?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=500',
  authorName = asI18n('Elsa Gardenowl'),
  authorAvatar = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-7.png',
  postedTime = asI18n('posted 34 minutes ago'),
  footer = asI18n('733 people liked this'),
}: ArticleCardFooterProps = {}) {
  return (
    <Card withBorder padding="lg" radius="md" className={classes.card}>
      <Card.Section mb="lg">
        <Image src={image} alt={title} height={180} />
      </Card.Section>

      <Badge color="violet" variant="outline">
        {category}
      </Badge>

      <Text className={classes.title}>{title}</Text>

      <Group mt="lg">
        <Avatar src={authorAvatar} radius="sm" alt={authorName} />

        <div>
          <Text c="bright" fw={500}>
            {authorName}
          </Text>
          <Text size="xs">{postedTime}</Text>
        </div>
      </Group>

      <Card.Section className={classes.footer}>
        <Group justify="space-between">
          <Text size="xs">{footer}</Text>
          <Group gap={0}>
            <ActionIcon variant="subtle" color="gray" aria-label={m.articlecardfooter__like()}>
              <Heart size={20} color="var(--mantine-color-red-6)" />
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" aria-label={m.articlecardfooter__bookmark()}>
              <Bookmark size={20} color="var(--mantine-color-yellow-7)" />
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" aria-label={m.articlecardfooter__share()}>
              <Share2 size={20} color="var(--mantine-color-cyan-6)" />
            </ActionIcon>
          </Group>
        </Group>
      </Card.Section>
    </Card>
  )
}
