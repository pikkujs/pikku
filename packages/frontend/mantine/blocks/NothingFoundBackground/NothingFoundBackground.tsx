import { Button, Container, Group, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { Illustration } from './Illustration'
import classes from './NothingFoundBackground.module.css'

type NothingFoundBackgroundProps = {
  // Optional handler for the "back to home" button; the block renders a
  // placeholder no-op button when omitted.
  onClick?: () => void
}

export function NothingFoundBackground({ onClick }: NothingFoundBackgroundProps = {}) {
  return (
    <Container className={classes.root}>
      <div className={classes.inner}>
        <Illustration className={classes.image} />
        <div className={classes.content}>
          <Title className={classes.title}>{m.nothingfoundbackground__title()}</Title>
          <Text c="dimmed" size="lg" ta="center" className={classes.description}>
            {m.nothingfoundbackground__description()}
          </Text>
          <Group justify="center">
            <Button size="md" onClick={onClick}>
              {m.nothingfoundbackground__back()}
            </Button>
          </Group>
        </div>
      </div>
    </Container>
  )
}
