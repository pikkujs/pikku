import { Avatar, Card, Group, Image, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './ArticleCardVertical.module.css'

export type ArticleCardVerticalProps = {
  category?: I18nString
  title?: I18nString
  // Opaque data — asI18n(...), never translated.
  authorName?: I18nString
  authorAvatar?: string
  date?: I18nString
  image?: string
}

export function ArticleCardVertical({
  category = m.articlecardvertical__category(),
  title = m.articlecardvertical__title(),
  authorName = asI18n('Elsa Typechecker'),
  authorAvatar = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-8.png',
  date = asI18n('Feb 6th'),
  image = 'https://images.unsplash.com/photo-1602080858428-57174f9431cf?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
}: ArticleCardVerticalProps = {}) {
  return (
    <Card withBorder radius="md" p={0} className={classes.card}>
      <Image src={image} className={classes.image} alt={title} />

      <div className={classes.body}>
        <Text tt="uppercase" opacity={0.8} fw={700} size="xs">
          {category}
        </Text>
        <Text className={classes.title} mt="xs" mb="md">
          {title}
        </Text>
        <Group gap="xs">
          <Group gap={7}>
            <Avatar size={20} src={authorAvatar} alt={authorName} />
            <Text size="xs" c="bright">
              {authorName}
            </Text>
          </Group>

          <Text span size="xs" opacity={0.8}>
            {asI18n('•')}
          </Text>

          <Text size="xs" opacity={0.8}>
            {date}
          </Text>
        </Group>
      </div>
    </Card>
  )
}
