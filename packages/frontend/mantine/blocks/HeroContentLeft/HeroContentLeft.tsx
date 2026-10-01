import { Button, Container, Overlay, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './HeroContentLeft.module.css'

export function HeroContentLeft() {
  return (
    <div className={classes.hero}>
      <Overlay
        gradient="linear-gradient(180deg, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, .65) 40%)"
        opacity={1}
        zIndex={0}
      />
      <Container className={classes.container} size="md">
        <Title className={classes.title}>{m.herocontentleft__title()}</Title>
        <Text className={classes.description} size="xl" mt="xl">
          {m.herocontentleft__description()}
        </Text>

        <Button variant="gradient" size="xl" radius="xl" className={classes.control}>
          {m.herocontentleft__get_started()}
        </Button>
      </Container>
    </div>
  )
}
