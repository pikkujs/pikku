import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import {
  ArrowLeftRight,
  ChevronRight,
  Ellipsis,
  Heart,
  LogOut,
  MessageCircle,
  Pause,
  Settings,
  Star,
  Trash2,
} from 'lucide-react'
import { ActionIcon, Avatar, Group, Menu, Text, useMantineTheme } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'

type UserMenuProps = {
  // The signed-in user — opaque data, passed via asI18n(...), never translated.
  name?: I18nString
  email?: I18nString
  // Avatar image URL; falls back to initials when omitted.
  image?: string
}

export const UserMenu: FC<UserMenuProps> = ({
  name = asI18n('Nancy Eggshacker'),
  email = asI18n('neggshaker@mantine.dev'),
  image = 'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-7.png',
}) => {
  const theme = useMantineTheme()
  return (
    <Group justify="center">
      <Menu
        withArrow
        width={300}
        position="bottom"
        transitionProps={{ transition: 'pop' }}
        withinPortal
      >
        <Menu.Target>
          <ActionIcon variant="default" aria-label={m.usermenu__user_settings()}>
            <Ellipsis size={16} strokeWidth={1.5} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item rightSection={<ChevronRight size={16} strokeWidth={1.5} />}>
            <Group>
              <Avatar radius="xl" src={image} name={name} color="initials" />

              <div>
                <Text fw={500}>{name}</Text>
                <Text size="xs" c="dimmed">
                  {email}
                </Text>
              </div>
            </Group>
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            leftSection={<Heart size={16} strokeWidth={1.5} color={theme.colors.red[6]} />}
          >
            {m.usermenu__liked_posts()}
          </Menu.Item>
          <Menu.Item
            leftSection={<Star size={16} strokeWidth={1.5} color={theme.colors.yellow[6]} />}
          >
            {m.usermenu__saved_posts()}
          </Menu.Item>
          <Menu.Item
            leftSection={<MessageCircle size={16} strokeWidth={1.5} color={theme.colors.blue[6]} />}
          >
            {m.usermenu__your_comments()}
          </Menu.Item>

          <Menu.Label>{m.usermenu__settings()}</Menu.Label>
          <Menu.Item leftSection={<Settings size={16} strokeWidth={1.5} />}>
            {m.usermenu__account_settings()}
          </Menu.Item>
          <Menu.Item leftSection={<ArrowLeftRight size={16} strokeWidth={1.5} />}>
            {m.usermenu__change_account()}
          </Menu.Item>
          <Menu.Item leftSection={<LogOut size={16} strokeWidth={1.5} />}>
            {m.usermenu__logout()}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Label>{m.usermenu__danger_zone()}</Menu.Label>
          <Menu.Item leftSection={<Pause size={16} strokeWidth={1.5} />}>
            {m.usermenu__pause_subscription()}
          </Menu.Item>
          <Menu.Item color="red" leftSection={<Trash2 size={16} strokeWidth={1.5} />}>
            {m.usermenu__delete_account()}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
