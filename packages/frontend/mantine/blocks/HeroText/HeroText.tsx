import { Button, Container, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { Dots } from './Dots'
import classes from './HeroText.module.css'

export function HeroText() {
  return (
    <Container className={classes.wrapper} size={1400}>
      <Dots className={classes.dots} style={{ left: 0, top: 0 }} />
      <Dots className={classes.dots} style={{ left: 60, top: 0 }} />
      <Dots className={classes.dots} style={{ left: 0, top: 140 }} />
      <Dots className={classes.dots} style={{ right: 0, top: 60 }} />

      <div className={classes.inner}>
        <Title className={classes.title}>
          {m.herotext__title_start()}
          <Text component="span" className={classes.highlight} inherit>
            {m.herotext__title_highlight()}
          </Text>
          {m.herotext__title_end()}
        </Title>

        <Container p={0} size={600}>
          <Text size="lg" c="dimmed" className={classes.description}>
            {m.herotext__description()}
          </Text>
        </Container>

        <div className={classes.controls}>
          <Button className={classes.control} size="lg" variant="default" color="gray">
            {m.herotext__book_demo()}
          </Button>
          <Button className={classes.control} size="lg">
            {m.herotext__purchase_license()}
          </Button>
        </div>
      </div>
    </Container>
  )
}
