import { Calendar, ChevronDown, Package, SquareCheck, Users } from 'lucide-react'
import { Button, Menu, Text, useMantineTheme } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'

export function ButtonMenu() {
  const theme = useMantineTheme()
  return (
    <Menu
      transitionProps={{ transition: 'pop-top-right' }}
      position="top-end"
      width={220}
      withinPortal
      radius="md"
    >
      <Menu.Target>
        <Button rightSection={<ChevronDown size={18} strokeWidth={1.5} />} pr={12} radius="md">
          {m.buttonmenu__create_new()}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Package size={16} color={theme.colors.blue[6]} strokeWidth={1.5} />}
          rightSection={
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {asI18n('Ctrl + P')}
            </Text>
          }
        >
          {m.buttonmenu__project()}
        </Menu.Item>
        <Menu.Item
          leftSection={<SquareCheck size={16} color={theme.colors.pink[6]} strokeWidth={1.5} />}
          rightSection={
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {asI18n('Ctrl + T')}
            </Text>
          }
        >
          {m.buttonmenu__task()}
        </Menu.Item>
        <Menu.Item
          leftSection={<Users size={16} color={theme.colors.cyan[6]} strokeWidth={1.5} />}
          rightSection={
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {asI18n('Ctrl + U')}
            </Text>
          }
        >
          {m.buttonmenu__team()}
        </Menu.Item>
        <Menu.Item
          leftSection={<Calendar size={16} color={theme.colors.violet[6]} strokeWidth={1.5} />}
          rightSection={
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              {asI18n('Ctrl + E')}
            </Text>
          }
        >
          {m.buttonmenu__event()}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}
