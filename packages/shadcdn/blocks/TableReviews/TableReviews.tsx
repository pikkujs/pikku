import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { m } from '@/i18n/messages'

export function TableReviews() {
  const rows = [
    { author: m.tablereviews__a1(), rating: m.tablereviews__r1(), text: m.tablereviews__t1() },
    { author: m.tablereviews__a2(), rating: m.tablereviews__r2(), text: m.tablereviews__t2() },
  ]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.tablereviews__author()}</TableHead>
          <TableHead>{m.tablereviews__rating()}</TableHead>
          <TableHead>{m.tablereviews__review()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.author}>
            <TableCell emphasis="strong">{row.author}</TableCell>
            <TableCell emphasis="numeric">{row.rating}</TableCell>
            <TableCell className="whitespace-normal">{row.text}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
