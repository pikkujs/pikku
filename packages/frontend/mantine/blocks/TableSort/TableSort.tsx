import { useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, type LucideIcon } from 'lucide-react'
import {
  Center,
  Group,
  ScrollArea,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nNode, I18nString } from '@pikku/react'
import classes from './TableSort.module.css'

// A row of the sortable table. Names/emails/companies are opaque data (not UI
// copy) — a real app passes live rows via the `data` prop (branded I18nString).
export interface TableSortRow {
  name: I18nString
  email: I18nString
  company: I18nString
}

interface ThProps {
  children: I18nNode
  reversed: boolean
  sorted: boolean
  onSort: () => void
}

function Th({ children, reversed, sorted, onSort }: ThProps) {
  const Icon: LucideIcon = sorted ? (reversed ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <Table.Th className={classes.th}>
      <UnstyledButton onClick={onSort} className={classes.control}>
        <Group justify="space-between">
          <Text fw={500} fz="sm">
            {children}
          </Text>
          <Center className={classes.icon}>
            <Icon size={16} strokeWidth={1.5} />
          </Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  )
}

function filterData(data: TableSortRow[], search: string) {
  const query = search.toLowerCase().trim()
  return data.filter((item) =>
    (Object.keys(item) as (keyof TableSortRow)[]).some((key) =>
      item[key].toLowerCase().includes(query),
    ),
  )
}

function sortData(
  data: TableSortRow[],
  payload: { sortBy: keyof TableSortRow | null; reversed: boolean; search: string },
) {
  const { sortBy } = payload
  if (!sortBy) {
    return filterData(data, payload.search)
  }
  return filterData(
    [...data].sort((a, b) =>
      payload.reversed ? b[sortBy].localeCompare(a[sortBy]) : a[sortBy].localeCompare(b[sortBy]),
    ),
    payload.search,
  )
}

const sampleData: TableSortRow[] = [
  {
    name: asI18n('Athena Weissnat'),
    company: asI18n('Little - Rippin'),
    email: asI18n('Elouise.Prohaska@yahoo.com'),
  },
  {
    name: asI18n('Deangelo Runolfsson'),
    company: asI18n('Greenfelder - Krajcik'),
    email: asI18n('Kadin_Trantow87@yahoo.com'),
  },
  {
    name: asI18n('Danny Carter'),
    company: asI18n('Kohler and Sons'),
    email: asI18n('Marina3@hotmail.com'),
  },
  {
    name: asI18n('Trace Tremblay PhD'),
    company: asI18n('Crona, Aufderhar and Senger'),
    email: asI18n('Antonina.Pouros@yahoo.com'),
  },
  {
    name: asI18n('Derek Dibbert'),
    company: asI18n('Gottlieb LLC'),
    email: asI18n('Abagail29@hotmail.com'),
  },
  {
    name: asI18n('Viola Bernhard'),
    company: asI18n('Funk, Rohan and Kreiger'),
    email: asI18n('Jamie23@hotmail.com'),
  },
  {
    name: asI18n('Austin Jacobi'),
    company: asI18n('Botsford - Corwin'),
    email: asI18n('Genesis42@yahoo.com'),
  },
  {
    name: asI18n('Hershel Mosciski'),
    company: asI18n('Okuneva, Farrell and Kilback'),
    email: asI18n('Idella.Stehr28@yahoo.com'),
  },
  {
    name: asI18n('Mylene Ebert'),
    company: asI18n('Kirlin and Sons'),
    email: asI18n('Hildegard17@hotmail.com'),
  },
  {
    name: asI18n('Lou Trantow'),
    company: asI18n('Parisian - Lemke'),
    email: asI18n('Hillard.Barrows1@hotmail.com'),
  },
  {
    name: asI18n('Dariana Weimann'),
    company: asI18n('Schowalter - Donnelly'),
    email: asI18n('Colleen80@gmail.com'),
  },
  {
    name: asI18n('Dr. Christy Herman'),
    company: asI18n('VonRueden - Labadie'),
    email: asI18n('Lilyan98@gmail.com'),
  },
]

interface TableSortProps {
  data?: TableSortRow[]
}

export function TableSort({ data = sampleData }: TableSortProps) {
  const [search, setSearch] = useState('')
  const [sortedData, setSortedData] = useState(data)
  const [sortBy, setSortBy] = useState<keyof TableSortRow | null>(null)
  const [reverseSortDirection, setReverseSortDirection] = useState(false)

  const setSorting = (field: keyof TableSortRow) => {
    const reversed = field === sortBy ? !reverseSortDirection : false
    setReverseSortDirection(reversed)
    setSortBy(field)
    setSortedData(sortData(data, { sortBy: field, reversed, search }))
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.currentTarget
    setSearch(value)
    setSortedData(sortData(data, { sortBy, reversed: reverseSortDirection, search: value }))
  }

  const rows = sortedData.map((row) => (
    <Table.Tr key={row.name}>
      <Table.Td>{row.name}</Table.Td>
      <Table.Td>{row.email}</Table.Td>
      <Table.Td>{row.company}</Table.Td>
    </Table.Tr>
  ))

  return (
    <ScrollArea>
      <TextInput
        placeholder={m.tablesort__search_placeholder()}
        mb="md"
        leftSection={<Search size={16} strokeWidth={1.5} />}
        value={search}
        onChange={handleSearchChange}
      />
      <Table horizontalSpacing="md" verticalSpacing="xs" miw={700} layout="fixed">
        <Table.Tbody>
          <Table.Tr>
            <Th
              sorted={sortBy === 'name'}
              reversed={reverseSortDirection}
              onSort={() => setSorting('name')}
            >
              {m.tablesort__name()}
            </Th>
            <Th
              sorted={sortBy === 'email'}
              reversed={reverseSortDirection}
              onSort={() => setSorting('email')}
            >
              {m.tablesort__email()}
            </Th>
            <Th
              sorted={sortBy === 'company'}
              reversed={reverseSortDirection}
              onSort={() => setSorting('company')}
            >
              {m.tablesort__company()}
            </Th>
          </Table.Tr>
        </Table.Tbody>
        <Table.Tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text fw={500} ta="center">
                  {m.tablesort__nothing_found()}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}
