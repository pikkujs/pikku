import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { m } from '@/i18n/messages'

export function OrganizationMembersTable() {
  const members = [m.organizationmemberstable__m1(), m.organizationmemberstable__m2()]
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.organizationmemberstable__member()}</TableHead>
          <TableHead>{m.organizationmemberstable__role()}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member}>
            <TableCell emphasis="strong">{member}</TableCell>
            <TableCell>
              <Select defaultValue="editor">
                <SelectTrigger aria-label={m.organizationmemberstable__role_label()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">{m.organizationmemberstable__editor()}</SelectItem>
                  <SelectItem value="admin">{m.organizationmemberstable__admin()}</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="text-end">
              <Button variant="ghost" size="sm">{m.organizationmemberstable__remove()}</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
