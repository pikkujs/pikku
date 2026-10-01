import { Carousel } from '@mantine/carousel'
import { Button, Paper, Text, Title, useMantineTheme } from '@pikku/mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './CardsCarousel.module.css'

interface CardProps {
  image: string
  title: I18nString
  category: I18nString
}

function Card({ image, title, category }: CardProps) {
  return (
    <Paper
      shadow="md"
      p="xl"
      radius="md"
      style={{ backgroundImage: `url(${image})` }}
      className={classes.card}
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
        {m.cardscarousel__read_article()}
      </Button>
    </Paper>
  )
}

export function CardsCarousel() {
  const theme = useMantineTheme()
  const mobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`)

  // Image URLs are opaque assets (plain strings); titles/categories are sample
  // UI copy kept translatable via m.*.
  const data: CardProps[] = [
    {
      image:
        'https://images.unsplash.com/photo-1508193638397-1c4234db14d8?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      title: m.cardscarousel__title_forests(),
      category: m.cardscarousel__category_nature(),
    },
    {
      image:
        'https://images.unsplash.com/photo-1559494007-9f5847c49d94?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      title: m.cardscarousel__title_beaches(),
      category: m.cardscarousel__category_beach(),
    },
    {
      image:
        'https://images.unsplash.com/photo-1608481337062-4093bf3ed404?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      title: m.cardscarousel__title_mountains(),
      category: m.cardscarousel__category_nature(),
    },
    {
      image:
        'https://images.unsplash.com/photo-1507272931001-fc06c17e4f43?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      title: m.cardscarousel__title_aurora(),
      category: m.cardscarousel__category_nature(),
    },
    {
      image:
        'https://images.unsplash.com/photo-1510798831971-661eb04b3739?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      title: m.cardscarousel__title_winter(),
      category: m.cardscarousel__category_tourism(),
    },
    {
      image:
        'https://images.unsplash.com/photo-1582721478779-0ae163c05a60?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80',
      title: m.cardscarousel__title_volcanos(),
      category: m.cardscarousel__category_nature(),
    },
  ]

  const slides = data.map((item) => (
    <Carousel.Slide key={item.image}>
      <Card {...item} />
    </Carousel.Slide>
  ))

  return (
    <Carousel
      slideSize={{ base: '100%', sm: '50%' }}
      slideGap={2}
      emblaOptions={{ align: 'start', slidesToScroll: mobile ? 1 : 2 }}
      nextControlProps={{ 'aria-label': m.cardscarousel__next_slide() }}
      previousControlProps={{ 'aria-label': m.cardscarousel__previous_slide() }}
    >
      {slides}
    </Carousel>
  )
}
