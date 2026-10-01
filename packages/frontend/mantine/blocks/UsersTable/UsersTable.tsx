import { Pencil, Trash2 } from 'lucide-react'
import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Group,
  Table,
  Text,
  VisuallyHidden,
} from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'

// A row of the users table. Name/job/email/phone are opaque data (not UI copy).
// A real app passes live rows via the `data` prop.
export interface UsersTableRow {
  name: I18nString
  job: I18nString
  email: I18nString
  phone: I18nString
  // Avatar image URL; opaque, never translated.
  avatar?: string
}

const sampleData: UsersTableRow[] = [
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-1.png',
    name: asI18n('Robert Wolfkisser'),
    job: asI18n('Engineer'),
    email: asI18n('rob_wolf@gmail.com'),
    phone: asI18n('+44 (452) 886 09 12'),
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-7.png',
    name: asI18n('Jill Jailbreaker'),
    job: asI18n('Engineer'),
    email: asI18n('jj@breaker.com'),
    phone: asI18n('+44 (934) 777 12 76'),
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png',
    name: asI18n('Henry Silkeater'),
    job: asI18n('Designer'),
    email: asI18n('henry@silkeater.io'),
    phone: asI18n('+44 (901) 384 88 34'),
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-3.png',
    name: asI18n('Bill Horsefighter'),
    job: asI18n('Designer'),
    email: asI18n('bhorsefighter@gmail.com'),
    phone: asI18n('+44 (667) 341 45 22'),
  },
  {
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-10.png',
    name: asI18n('Jeremy Footviewer'),
    job: asI18n('Manager'),
    email: asI18n('jeremy@foot.dev'),
    phone: asI18n('+44 (881) 245 65 65'),
  },
]

const jobColors: Record<string, string> = {
  engineer: 'blue',
  manager: 'cyan',
  designer: 'pink',
}

interface UsersTableProps {
  data?: UsersTableRow[]
}

export function UsersTable({ data = sampleData }: UsersTableProps) {
  const rows = data.map((item) => (
    <Table.Tr key={item.name}>
      <Table.Td>
        <Group gap="sm">
          <Avatar size={30} src={item.avatar} radius={30} alt="" />
          <Text fz="sm" fw={500}>
            {item.name}
          </Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Badge color={jobColors[item.job.toLowerCase()]} variant="light">
          {item.job}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Anchor component="button" size="sm">
          {item.email}
        </Anchor>
      </Table.Td>
      <Table.Td>
        <Text fz="sm">{item.phone}</Text>
      </Table.Td>
      <Table.Td>
        <Group gap={0} justify="flex-end">
          <ActionIcon variant="subtle" color="gray" aria-label={m.userstable__edit_user()}>
            <Pencil size={16} strokeWidth={1.5} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" aria-label={m.userstable__delete_user()}>
            <Trash2 size={16} strokeWidth={1.5} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  ))

  return (
    <Table.ScrollContainer minWidth={800}>
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{m.userstable__employee()}</Table.Th>
            <Table.Th>{m.userstable__job_title()}</Table.Th>
            <Table.Th>{m.userstable__email()}</Table.Th>
            <Table.Th>{m.userstable__phone()}</Table.Th>
            <Table.Th>
              <VisuallyHidden>{m.userstable__actions()}</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
