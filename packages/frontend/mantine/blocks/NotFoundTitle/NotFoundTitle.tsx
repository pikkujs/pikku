import { Button, Container, Group, Text, Title } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './NotFoundTitle.module.css'

type NotFoundTitleProps = {
  // Optional handler for the "back to home" button; the block renders a
  // placeholder no-op button when omitted.
  onClick?: () => void
}

export function NotFoundTitle({ onClick }: NotFoundTitleProps = {}) {
  return (
    <Container className={classes.root}>
      <div className={classes.label}>{asI18n('404')}</div>
      <Title className={classes.title}>{m.notfoundtitle__title()}</Title>
      <Text c="dimmed" size="lg" ta="center" className={classes.description}>
        {m.notfoundtitle__description()}
      </Text>
      <Group justify="center">
        <Button variant="subtle" size="md" onClick={onClick}>
          {m.notfoundtitle__back()}
        </Button>
      </Group>
    </Container>
  )
}
