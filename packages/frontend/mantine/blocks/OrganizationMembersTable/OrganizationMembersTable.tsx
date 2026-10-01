import {
  ActionIcon,
  Alert,
  Badge,
  Center,
  Group,
  Loader,
  Paper,
  type PaperProps,
  Table,
  Text,
} from '@pikku/mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import { listMembers, removeMember } from './org-auth'

// The active organization's members with their role, and a remove action per row.
// Reads via useQuery(listMembers); removeMember invalidates the list so the table
// refreshes. Errors render inline.
export function OrganizationMembersTable(props: PaperProps) {
  const qc = useQueryClient()
  const members = useQuery({ queryKey: ['org', 'members'], queryFn: () => listMembers() })
  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org', 'members'] }),
  })

  return (
    <Paper withBorder radius="md" p="lg" {...props}>
      <Text fw={600} mb="md">
        {m.organizationmemberstable__title()}
      </Text>
      {members.isPending ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : members.isError ? (
        <Alert color="red" variant="light">
          {asI18n(members.error.message)}
        </Alert>
      ) : members.data.length === 0 ? (
        <Text c="dimmed" size="sm">
          {m.organizationmemberstable__empty()}
        </Text>
      ) : (
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{m.organizationmemberstable__member()}</Table.Th>
              <Table.Th>{m.organizationmemberstable__role()}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.data.map((member) => (
              <Table.Tr key={member.id}>
                <Table.Td>
                  <Text size="sm">
                    {asI18n(member.user?.name || member.user?.email || member.id)}
                  </Text>
                  {member.user?.email && (
                    <Text size="xs" c="dimmed">
                      {asI18n(member.user.email)}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{asI18n(member.role)}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={m.organizationmemberstable__remove()}
                      loading={remove.isPending && remove.variables === member.id}
                      onClick={() => remove.mutate(member.id)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {remove.isError && (
        <Alert color="red" variant="light" mt="sm">
          {asI18n(remove.error.message)}
        </Alert>
      )}
    </Paper>
  )
}
