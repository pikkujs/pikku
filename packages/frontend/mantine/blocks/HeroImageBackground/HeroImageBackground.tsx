import { Button, Container, Overlay, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './HeroImageBackground.module.css'

export function HeroImageBackground() {
  return (
    <div className={classes.wrapper}>
      <Overlay color="#000" opacity={0.65} zIndex={1} />

      <div className={classes.inner}>
        <Title className={classes.title}>
          {m.heroimagebackground__title_start()}
          <Text component="span" inherit className={classes.highlight}>
            {m.heroimagebackground__title_highlight()}
          </Text>
        </Title>

        <Container size={640}>
          <Text size="lg" className={classes.description}>
            {m.heroimagebackground__description()}
          </Text>
        </Container>

        <div className={classes.controls}>
          <Button className={classes.control} variant="white" size="lg">
            {m.heroimagebackground__get_started()}
          </Button>
          <Button className={`${classes.control} ${classes.secondaryControl}`} size="lg">
            {m.heroimagebackground__live_demo()}
          </Button>
        </div>
      </div>
    </div>
  )
}
