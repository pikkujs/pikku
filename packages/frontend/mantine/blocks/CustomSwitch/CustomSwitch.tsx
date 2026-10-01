import { Group, Switch } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './CustomSwitch.module.css'

export function CustomSwitch() {
  return (
    <Group justify="center" p="md">
      <Switch label={m.customswitch__label()} classNames={classes} withThumbIndicator={false} />
    </Group>
  )
}
