import { Button, Paper, Text, Title } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import classes from './ArticleCardImage.module.css'

export type ArticleCardImageProps = {
  category?: I18nString
  title?: I18nString
  label?: I18nString
  image?: string
}

export function ArticleCardImage({
  category = m.articlecardimage__category(),
  title = m.articlecardimage__title(),
  label = m.articlecardimage__label(),
  image = 'https://images.unsplash.com/photo-1508193638397-1c4234db14d8?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
}: ArticleCardImageProps = {}) {
  return (
    <Paper
      shadow="md"
      p="xl"
      radius="md"
      className={classes.card}
      style={{ backgroundImage: `url(${image})` }}
    >
      <div>
        <Text className={classes.category} size="xs">
          {category}
        </Text>
        <Title order={3} className={classes.title}>
          {title}
        </Title>
      </div>
      <Button variant="white" color="dark">
        {label}
      </Button>
    </Paper>
  )
}
