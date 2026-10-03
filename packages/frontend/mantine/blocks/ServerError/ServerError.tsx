import { Button, Container, Group, Text, Title } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './ServerError.module.css'

type ServerErrorProps = {
  // Optional handler for the "refresh" button; the block renders a placeholder
  // no-op button when omitted.
  onClick?: () => void
}

export function ServerError({ onClick }: ServerErrorProps = {}) {
  return (
    <div className={classes.root}>
      <Container>
        <div className={classes.label}>{asI18n('500')}</div>
        <Title className={classes.title}>{m.servererror__title()}</Title>
        <Text size="lg" ta="center" className={classes.description}>
          {m.servererror__description()}
        </Text>
        <Group justify="center">
          <Button variant="white" size="md" onClick={onClick}>
            {m.servererror__refresh()}
          </Button>
        </Group>
      </Container>
    </div>
  )
}
