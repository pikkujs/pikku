import { Moon, Sun } from 'lucide-react'
import {
  ActionIcon,
  Group,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './ActionToggle.module.css'

export function ActionToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('light', {
    getInitialValueInEffect: true,
  })

  return (
    <Group justify="center">
      <ActionIcon
        onClick={() => setColorScheme(computedColorScheme === 'light' ? 'dark' : 'light')}
        variant="default"
        size="xl"
        radius="md"
        aria-label={m.actiontoggle__toggle_color_scheme()}
      >
        <Sun className={`${classes.icon} ${classes.light}`} strokeWidth={1.5} />
        <Moon className={`${classes.icon} ${classes.dark}`} strokeWidth={1.5} />
      </ActionIcon>
    </Group>
  )
}
