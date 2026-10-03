import { Star } from 'lucide-react'
import { Carousel } from '@mantine/carousel'
import { Button, Card, Group, Image, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './CarouselCard.module.css'

// Image URLs are opaque assets (plain strings).
const images = [
  'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1605774337664-7a846e9cdf17?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=720&q=80',
]

export function CarouselCard() {
  const slides = images.map((image, index) => (
    <Carousel.Slide key={image}>
      <Image src={image} height={220} alt={m.carouselcard__slide_alt({ index: index + 1 })} />
    </Carousel.Slide>
  ))

  return (
    <Card radius="md" withBorder padding="xl">
      <Card.Section>
        <Carousel
          withIndicators
          emblaOptions={{ loop: true }}
          classNames={{
            root: classes.carousel,
            controls: classes.carouselControls,
            indicator: classes.carouselIndicator,
          }}
          previousControlProps={{ 'aria-label': m.carouselcard__previous_slide() }}
          nextControlProps={{ 'aria-label': m.carouselcard__next_slide() }}
        >
          {slides}
        </Carousel>
      </Card.Section>

      <Group justify="space-between" mt="lg">
        <Text fw={500} fz="lg">
          {asI18n('Forde, Norway')}
        </Text>

        <Group gap={5}>
          <Star
            size={16}
            fill="var(--mantine-color-yellow-6)"
            color="var(--mantine-color-yellow-6)"
          />
          <Text fz="sm" fw={600}>
            {asI18n('4.78')}
          </Text>
        </Group>
      </Group>

      <Text fz="sm" c="dimmed" mt="sm">
        {m.carouselcard__description()}
      </Text>

      <Group justify="space-between" mt="md">
        <div>
          <Text fz="xl" span fw={500} className={classes.price}>
            {asI18n('397$')}
          </Text>
          <Text span fz="sm" c="dimmed">
            {m.carouselcard__per_night()}
          </Text>
        </div>

        <Button radius="md">{m.carouselcard__book_now()}</Button>
      </Group>
    </Card>
  )
}
