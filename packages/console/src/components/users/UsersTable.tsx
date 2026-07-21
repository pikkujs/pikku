import { Table, Group, Avatar, Box, Text } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'

/**
 * A user row as rendered by {@link UsersTable}. A structural superset of both
 * the console's `console:listUsers` directory entry (image) and a brokered
 * listing that only carries id/email/name/createdAt — the extra fields are
 * optional so a host that lacks them (e.g. Fabric's server-brokered stage
 * users) can omit them.
 */
export interface UsersTableUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  createdAt?: string | Date | null
}

/** Translated column headers — passed in so the component
 * carries no i18n bundle of its own and both consoles supply their own copy. */
export interface UsersTableLabels {
  columnUser: I18nString
  columnCreated: I18nString
}

export interface UsersTableProps {
  users: UsersTableUser[]
  labels: UsersTableLabels
  /** Trailing action cell per row (e.g. an impersonate button). The host owns
   * the behaviour; this component stays presentation-only. Omit for no column. */
  renderActions?: (user: UsersTableUser) => React.ReactNode
}

/**
 * Presentation-only user list: avatar + name/email, joined date, and an
 * optional host-supplied action cell. No data fetching, router, or auth client
 * — feed it `users` and translated `labels`. What a user is allowed to do is
 * not a column here: authorization is scope-based, so it lives in the roles
 * drawer. Shared by the OSS AdminUsersPage (fed by the `console:listUsers`
 * RPC) and Fabric's stage Users tab (fed by a server-brokered RPC).
 */
export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  labels,
  renderActions,
}) => (
  <Table verticalSpacing="sm" highlightOnHover>
    <Table.Thead>
      <Table.Tr>
        <Table.Th>{labels.columnUser}</Table.Th>
        <Table.Th>{labels.columnCreated}</Table.Th>
        {renderActions && <Table.Th />}
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {users.map((u) => (
        <Table.Tr key={u.id}>
          <Table.Td>
            <Group gap="sm" wrap="nowrap">
              <Avatar src={u.image ?? undefined} radius="xl" size="sm">
                {(u.name ?? u.email).slice(0, 1).toUpperCase()}
              </Avatar>
              <Box style={{ minWidth: 0 }}>
                {u.name && (
                  <Text size="sm" fw={500} truncate>
                    {asI18n(u.name)}
                  </Text>
                )}
                <Text size="xs" c="dimmed" truncate>
                  {asI18n(u.email)}
                </Text>
              </Box>
            </Group>
          </Table.Td>
          <Table.Td>
            <Text size="sm" c="dimmed">
              {u.createdAt
                ? asI18n(new Date(u.createdAt).toLocaleDateString())
                : asI18n('—')}
            </Text>
          </Table.Td>
          {renderActions && <Table.Td>{renderActions(u)}</Table.Td>}
        </Table.Tr>
      ))}
    </Table.Tbody>
  </Table>
)
