import { Bookmark, Calendar, ChevronDown, Trash2 } from 'lucide-react'
import { ActionIcon, Button, Group, Menu, useMantineTheme } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './SplitButton.module.css'

export function SplitButton() {
  const theme = useMantineTheme()

  return (
    <Group wrap="nowrap" gap={0}>
      <Button className={classes.button}>{m.splitbutton__send()}</Button>
      <Menu transitionProps={{ transition: 'pop' }} position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="filled"
            color={theme.primaryColor}
            size={36}
            className={classes.menuControl}
            aria-label={m.splitbutton__more_options()}
          >
            <ChevronDown size={16} strokeWidth={1.5} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Calendar size={16} strokeWidth={1.5} color={theme.colors.blue[5]} />}
          >
            {m.splitbutton__schedule()}
          </Menu.Item>
          <Menu.Item
            leftSection={<Bookmark size={16} strokeWidth={1.5} color={theme.colors.blue[5]} />}
          >
            {m.splitbutton__save_draft()}
          </Menu.Item>
          <Menu.Item
            leftSection={<Trash2 size={16} strokeWidth={1.5} color={theme.colors.blue[5]} />}
          >
            {m.splitbutton__delete()}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
