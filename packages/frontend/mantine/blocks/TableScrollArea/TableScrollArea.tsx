import { useState } from 'react'
import { ScrollArea, Table } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './TableScrollArea.module.css'

// A row of the scrollable table. Names/emails/companies are opaque data (not UI
// copy). A real app passes live rows via the `data` prop.
export interface TableScrollAreaRow {
  name: I18nString
  email: I18nString
  company: I18nString
}

const sampleData: TableScrollAreaRow[] = [
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
  {
    name: asI18n('Katelin Schuster'),
    company: asI18n('Jacobson - Smitham'),
    email: asI18n('Erich_Brekke76@gmail.com'),
  },
  {
    name: asI18n('Melyna Macejkovic'),
    company: asI18n('Schuster LLC'),
    email: asI18n('Kylee4@yahoo.com'),
  },
  {
    name: asI18n('Pinkie Rice'),
    company: asI18n('Wolf, Trantow and Zulauf'),
    email: asI18n('Fiona.Kutch@hotmail.com'),
  },
  {
    name: asI18n('Brain Kreiger'),
    company: asI18n('Lueilwitz Group'),
    email: asI18n('Rico98@hotmail.com'),
  },
]

interface TableScrollAreaProps {
  data?: TableScrollAreaRow[]
}

export function TableScrollArea({ data = sampleData }: TableScrollAreaProps) {
  const [scrolled, setScrolled] = useState(false)

  const rows = data.map((row) => (
    <Table.Tr key={row.name}>
      <Table.Td>{row.name}</Table.Td>
      <Table.Td>{row.email}</Table.Td>
      <Table.Td>{row.company}</Table.Td>
    </Table.Tr>
  ))

  return (
    <ScrollArea h={300} onScrollPositionChange={({ y }) => setScrolled(y !== 0)}>
      <Table miw={700}>
        <Table.Thead className={`${classes.header}${scrolled ? ` ${classes.scrolled}` : ''}`}>
          <Table.Tr>
            <Table.Th>{m.tablescrollarea__name()}</Table.Th>
            <Table.Th>{m.tablescrollarea__email()}</Table.Th>
            <Table.Th>{m.tablescrollarea__company()}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </ScrollArea>
  )
}
