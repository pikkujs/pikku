import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { Ellipsis, LineChart, MessagesSquare, Pencil, StickyNote, Trash2 } from 'lucide-react'
import { ActionIcon, Avatar, Group, Menu, Table, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'

type UserRow = {
  // Per-row user fields are opaque data (asI18n); rate is a number.
  name: I18nString
  job: I18nString
  email: I18nString
  avatar: string
  rate: number
}

type UsersStackProps = {
  data?: UserRow[]
}

const sampleData: UserRow[] = [
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-1.png',
    name: asI18n('Robert Wolfkisser'),
    job: asI18n('Engineer'),
    email: asI18n('rob_wolf@gmail.com'),
    rate: 22,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-5.png',
    name: asI18n('Jill Jailbreaker'),
    job: asI18n('Engineer'),
    email: asI18n('jj@breaker.com'),
    rate: 45,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-3.png',
    name: asI18n('Henry Silkeater'),
    job: asI18n('Designer'),
    email: asI18n('henry@silkeater.io'),
    rate: 76,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-3.png',
    name: asI18n('Bill Horsefighter'),
    job: asI18n('Designer'),
    email: asI18n('bhorsefighter@gmail.com'),
    rate: 15,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png',
    name: asI18n('Jeremy Footviewer'),
    job: asI18n('Manager'),
    email: asI18n('jeremy@foot.dev'),
    rate: 98,
  },
]

export const UsersStack: FC<UsersStackProps> = ({ data = sampleData }) => {
  const rows = data.map((item) => (
    <Table.Tr key={item.email}>
      <Table.Td>
        <Group gap="sm">
          <Avatar size={40} src={item.avatar} radius={40} name={item.name} />
          <div>
            <Text fz="sm" fw={500}>
              {item.name}
            </Text>
            <Text c="dimmed" fz="xs">
              {item.job}
            </Text>
          </div>
        </Group>
      </Table.Td>
      <Table.Td>
        <Text fz="sm">{item.email}</Text>
        <Text fz="xs" c="dimmed">
          {m.usersstack__email()}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fz="sm">{m.usersstack__rate_per_hr({ rate: item.rate.toFixed(1) })}</Text>
        <Text fz="xs" c="dimmed">
          {m.usersstack__rate()}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap={0} justify="flex-end">
          <ActionIcon variant="subtle" color="gray" aria-label={m.usersstack__edit()}>
            <Pencil size={16} strokeWidth={1.5} />
          </ActionIcon>
          <Menu
            transitionProps={{ transition: 'pop' }}
            withArrow
            position="bottom-end"
            withinPortal
          >
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={m.usersstack__menu()}>
                <Ellipsis size={16} strokeWidth={1.5} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<MessagesSquare size={16} strokeWidth={1.5} />}>
                {m.usersstack__send_message()}
              </Menu.Item>
              <Menu.Item leftSection={<StickyNote size={16} strokeWidth={1.5} />}>
                {m.usersstack__add_note()}
              </Menu.Item>
              <Menu.Item leftSection={<LineChart size={16} strokeWidth={1.5} />}>
                {m.usersstack__analytics()}
              </Menu.Item>
              <Menu.Item leftSection={<Trash2 size={16} strokeWidth={1.5} />} color="red">
                {m.usersstack__terminate_contract()}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Table.Td>
    </Table.Tr>
  ))

  return (
    <Table.ScrollContainer minWidth={800}>
      <Table verticalSpacing="md">
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
