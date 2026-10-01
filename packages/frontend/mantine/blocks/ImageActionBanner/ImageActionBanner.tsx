import { Button, Card, Overlay, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './ImageActionBanner.module.css'

export function ImageActionBanner() {
  return (
    <Card radius="md" className={classes.card}>
      <Overlay className={classes.overlay} opacity={0.55} zIndex={0} />

      <div className={classes.content}>
        <Text size="lg" fw={700} className={classes.title}>
          {m.imageactionbanner__title()}
        </Text>

        <Text size="sm" className={classes.description}>
          {m.imageactionbanner__description()}
        </Text>

        <Button className={classes.action} variant="white" color="dark" size="xs">
          {m.imageactionbanner__action()}
        </Button>
      </div>
    </Card>
  )
}
