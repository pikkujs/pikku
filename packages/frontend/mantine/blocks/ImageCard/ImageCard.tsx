import { Eye, MessageCircle } from 'lucide-react'
import { Card, Center, Group, Text, useMantineTheme } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './ImageCard.module.css'

export type ImageCardProps = {
  image?: string
  href?: string
  title?: I18nString
  // Opaque data — asI18n(...), never translated.
  author?: I18nString
  views?: I18nString
  comments?: I18nString
}

export function ImageCard({
  image = 'https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
  href = 'https://mantine.dev/',
  title = m.imagecard__title(),
  author = asI18n('Robert Gluesticker'),
  views = asI18n('7847'),
  comments = asI18n('5'),
}: ImageCardProps = {}) {
  const theme = useMantineTheme()

  return (
    <Card
      p="lg"
      shadow="lg"
      className={classes.card}
      radius="md"
      component="a"
      href={href}
      target="_blank"
    >
      <div className={classes.image} style={{ backgroundImage: `url(${image})` }} />
      <div className={classes.overlay} />

      <div className={classes.content}>
        <div>
          <Text size="lg" className={classes.title} fw={500}>
            {title}
          </Text>

          <Group justify="space-between" gap="xs">
            <Text size="sm" className={classes.author}>
              {author}
            </Text>

            <Group gap="lg">
              <Center>
                <Eye size={16} strokeWidth={1.5} color={theme.colors.dark[2]} />
                <Text size="sm" className={classes.bodyText}>
                  {views}
                </Text>
              </Center>
              <Center>
                <MessageCircle size={16} strokeWidth={1.5} color={theme.colors.dark[2]} />
                <Text size="sm" className={classes.bodyText}>
                  {comments}
                </Text>
              </Center>
            </Group>
          </Group>
        </div>
      </div>
    </Card>
  )
}
