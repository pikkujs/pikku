import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { m } from '@/i18n/messages'

export function UsersTable() {
  const users = [
    { name: m.userstable__u1_name(), role: m.userstable__u1_role(), status: m.userstable__u1_status() },
    { name: m.userstable__u2_name(), role: m.userstable__u2_role(), status: m.userstable__u2_status() },
  ]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.userstable__name()}</TableHead>
          <TableHead>{m.userstable__role()}</TableHead>
          <TableHead>{m.userstable__status()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.name}>
            <TableCell emphasis="strong">{user.name}</TableCell>
            <TableCell>{user.role}</TableCell>
            <TableCell>
              <Badge variant="secondary">{user.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
