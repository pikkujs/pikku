import { useState } from 'react'
import { Avatar, Checkbox, Group, ScrollArea, Table, Text } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './TableSelection.module.css'

// A selectable row. `id` is an opaque key; name/job/email are opaque data (not
// UI copy). A real app passes live rows via the `data` prop.
export interface TableSelectionRow {
  id: string
  name: I18nString
  job: I18nString
  email: I18nString
  // Avatar image URL; opaque, never translated.
  avatar?: string
}

const sampleData: TableSelectionRow[] = [
  {
    id: '1',
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-1.png',
    name: asI18n('Robert Wolfkisser'),
    job: asI18n('Engineer'),
    email: asI18n('rob_wolf@gmail.com'),
  },
  {
    id: '2',
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-7.png',
    name: asI18n('Jill Jailbreaker'),
    job: asI18n('Engineer'),
    email: asI18n('jj@breaker.com'),
  },
  {
    id: '3',
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-2.png',
    name: asI18n('Henry Silkeater'),
    job: asI18n('Designer'),
    email: asI18n('henry@silkeater.io'),
  },
  {
    id: '4',
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-3.png',
    name: asI18n('Bill Horsefighter'),
    job: asI18n('Designer'),
    email: asI18n('bhorsefighter@gmail.com'),
  },
  {
    id: '5',
    avatar:
      'https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-10.png',
    name: asI18n('Jeremy Footviewer'),
    job: asI18n('Manager'),
    email: asI18n('jeremy@foot.dev'),
  },
]

interface TableSelectionProps {
  data?: TableSelectionRow[]
}

export function TableSelection({ data = sampleData }: TableSelectionProps) {
  const [selection, setSelection] = useState<string[]>(['1'])
  const toggleRow = (id: string) =>
    setSelection((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  const toggleAll = () =>
    setSelection((current) => (current.length === data.length ? [] : data.map((item) => item.id)))

  const rows = data.map((item) => {
    const selected = selection.includes(item.id)
    return (
      <Table.Tr key={item.id} className={selected ? classes.rowSelected : undefined}>
        <Table.Td>
          <Checkbox
            checked={selection.includes(item.id)}
            onChange={() => toggleRow(item.id)}
            aria-label={m.tableselection__select_row()}
          />
        </Table.Td>
        <Table.Td>
          <Group gap="sm">
            <Avatar size={26} src={item.avatar} radius={26} alt="" />
            <Text size="sm" fw={500}>
              {item.name}
            </Text>
          </Group>
        </Table.Td>
        <Table.Td>{item.email}</Table.Td>
        <Table.Td>{item.job}</Table.Td>
      </Table.Tr>
    )
  })

  return (
    <ScrollArea>
      <Table miw={800} verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40} aria-label={m.tableselection__select_all()}>
              <Checkbox
                onChange={toggleAll}
                checked={selection.length === data.length}
                indeterminate={selection.length > 0 && selection.length !== data.length}
                aria-label={m.tableselection__select_all()}
              />
            </Table.Th>
            <Table.Th>{m.tableselection__user()}</Table.Th>
            <Table.Th>{m.tableselection__email()}</Table.Th>
            <Table.Th>{m.tableselection__job()}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </ScrollArea>
  )
}
