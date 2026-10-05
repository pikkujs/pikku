import { asI18n } from '@pikku/react'
import type { Story, StoryMeta } from './csf.types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'

export default {
  title: 'Table',
  component: Table,
  group: 'Display',
  description: 'Rows and columns of records. Right-align numbers with text-end.',
} satisfies StoryMeta

const rows = [
  { id: 'INV-001', status: 'Paid', total: '250.00' },
  { id: 'INV-002', status: 'Pending', total: '120.50' },
]

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{asI18n('Invoice')}</TableHead>
          <TableHead>{asI18n('Status')}</TableHead>
          <TableHead className="text-end">{asI18n('Total')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.id}</TableCell>
            <TableCell>{row.status}</TableCell>
            <TableCell className="text-end">{row.total}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}
