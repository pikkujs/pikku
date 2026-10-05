import { AspectRatio, Card, Container, Image, SimpleGrid, Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { asI18n, m } from '@/i18n/messages'
import classes from './ArticlesCardsGrid.module.css'

export type ArticleGridItem = {
  title: I18nString
  image: string
  // Opaque date — asI18n(...), never translated.
  date: I18nString
}

export type ArticlesCardsGridProps = {
  articles?: ArticleGridItem[]
}

export function ArticlesCardsGrid({ articles }: ArticlesCardsGridProps = {}) {
  const data: ArticleGridItem[] = articles ?? [
    {
      title: m.articlescardsgrid__title_1(),
      image:
        'https://images.unsplash.com/photo-1527004013197-933c4bb611b3?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
      date: asI18n('August 18, 2022'),
    },
    {
      title: m.articlescardsgrid__title_2(),
      image:
        'https://images.unsplash.com/photo-1448375240586-882707db888b?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
      date: asI18n('August 27, 2022'),
    },
    {
      title: m.articlescardsgrid__title_3(),
      image:
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
      date: asI18n('September 9, 2022'),
    },
    {
      title: m.articlescardsgrid__title_4(),
      image:
        'https://images.unsplash.com/photo-1519681393784-d120267933ba?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
      date: asI18n('September 12, 2022'),
    },
  ]

  const cards = data.map((article, i) => (
    <Card key={i} p="md" radius="md" component="a" href="#" className={classes.card}>
      <AspectRatio ratio={1920 / 1080}>
        <Image src={article.image} alt={article.title} radius="md" />
      </AspectRatio>
      <Text className={classes.date}>{article.date}</Text>
      <Text className={classes.title}>{article.title}</Text>
    </Card>
  ))

  return (
    <Container py="xl">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={{ base: 0, sm: 'md' }}>
        {cards}
      </SimpleGrid>
    </Container>
  )
}
