import { Avatar, Badge, Group, Select, Table, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'

// A row of the users-and-roles table. Name/email/role/lastActive are opaque data
// (not UI copy). A real app passes live rows via the `data` prop.
export interface UsersRolesTableRow {
  name: I18nString
  email: I18nString
  role: I18nString
  lastActive: I18nString
  active: boolean
  // Avatar image URL; opaque, never translated.
  avatar?: string
}

const sampleData: UsersRolesTableRow[] = [
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-9.png',
    name: asI18n('Robert Wolfkisser'),
    email: asI18n('rob_wolf@gmail.com'),
    role: asI18n('Collaborator'),
    lastActive: asI18n('2 days ago'),
    active: true,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-6.png',
    name: asI18n('Jill Jailbreaker'),
    email: asI18n('jj@breaker.com'),
    role: asI18n('Collaborator'),
    lastActive: asI18n('6 days ago'),
    active: true,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-10.png',
    name: asI18n('Henry Silkeater'),
    email: asI18n('henry@silkeater.io'),
    role: asI18n('Contractor'),
    lastActive: asI18n('2 days ago'),
    active: false,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png',
    name: asI18n('Bill Horsefighter'),
    email: asI18n('bhorsefighter@gmail.com'),
    role: asI18n('Contractor'),
    lastActive: asI18n('5 days ago'),
    active: true,
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-3.png',
    name: asI18n('Jeremy Footviewer'),
    email: asI18n('jeremy@foot.dev'),
    role: asI18n('Manager'),
    lastActive: asI18n('3 days ago'),
    active: false,
  },
]

// Role options are opaque data (a real app supplies its own role set).
const defaultRoles: I18nString[] = [asI18n('Manager'), asI18n('Collaborator'), asI18n('Contractor')]

interface UsersRolesTableProps {
  data?: UsersRolesTableRow[]
  roles?: I18nString[]
}

export function UsersRolesTable({ data = sampleData, roles = defaultRoles }: UsersRolesTableProps) {
  const rows = data.map((item) => (
    <Table.Tr key={item.name}>
      <Table.Td>
        <Group gap="sm">
          <Avatar size={40} src={item.avatar} radius={40} alt="" />
          <div>
            <Text fz="sm" fw={500}>
              {item.name}
            </Text>
            <Text fz="xs" c="dimmed">
              {item.email}
            </Text>
          </div>
        </Group>
      </Table.Td>
      <Table.Td>
        <Select
          data={roles}
          defaultValue={item.role}
          variant="unstyled"
          allowDeselect={false}
          aria-label={m.usersrolestable__role()}
        />
      </Table.Td>
      <Table.Td>{item.lastActive}</Table.Td>
      <Table.Td>
        {item.active ? (
          <Badge fullWidth variant="light">
            {m.usersrolestable__active()}
          </Badge>
        ) : (
          <Badge color="gray" fullWidth variant="light">
            {m.usersrolestable__disabled()}
          </Badge>
        )}
      </Table.Td>
    </Table.Tr>
  ))

  return (
    <Table.ScrollContainer minWidth={800}>
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{m.usersrolestable__employee()}</Table.Th>
            <Table.Th>{m.usersrolestable__role()}</Table.Th>
            <Table.Th>{m.usersrolestable__last_active()}</Table.Th>
            <Table.Th>{m.usersrolestable__status()}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
