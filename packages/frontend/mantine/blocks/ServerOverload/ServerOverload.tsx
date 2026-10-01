import { Button, Container, Group, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { Illustration } from './Illustration'
import classes from './ServerOverload.module.css'

type ServerOverloadProps = {
  // Optional handler for the "refresh" button; the block renders a placeholder
  // no-op button when omitted.
  onClick?: () => void
}

export function ServerOverload({ onClick }: ServerOverloadProps = {}) {
  return (
    <div className={classes.root}>
      <Container>
        <div className={classes.inner}>
          <Illustration className={classes.image} />
          <div className={classes.content}>
            <Title className={classes.title}>{m.serveroverload__title()}</Title>
            <Text size="lg" ta="center" className={classes.description}>
              {m.serveroverload__description()}
            </Text>
            <Group justify="center">
              <Button size="md" variant="white" onClick={onClick}>
                {m.serveroverload__refresh()}
              </Button>
            </Group>
          </div>
        </div>
      </Container>
    </div>
  )
}
