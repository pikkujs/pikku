import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { m } from '@/i18n/messages'

export function TableSelection() {
  const rows = [
    { name: m.tableselection__r1(), role: m.tableselection__r1_role() },
    { name: m.tableselection__r2(), role: m.tableselection__r2_role() },
  ]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox aria-label={m.tableselection__select_all()} />
          </TableHead>
          <TableHead>{m.tableselection__name()}</TableHead>
          <TableHead>{m.tableselection__role()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell>
              <Checkbox aria-label={m.tableselection__select_row()} />
            </TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.role}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
