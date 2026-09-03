import { Table, Group, Avatar, Box, Text, Badge } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'
import classes from '../ui/console.module.css'

/**
 * A user row as rendered by {@link UsersTable}. A structural superset of both
 * the admin addon's `admin:listUsers` directory entry (image) and a brokered
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
  /**
   * Ban state, as the server reported it. `undefined` is not "not banned": it
   * means the host has no `pikkuBan()` plugin and so has no such state to
   * report, which is why the status column is left out rather than filled with
   * an invented "active".
   */
  banned?: boolean | null
}

/** Translated column headers — passed in so the component
 * carries no i18n bundle of its own and both consoles supply their own copy. */
export interface UsersTableLabels {
  columnUser: I18nString
  columnCreated: I18nString
  /** Shown in the joined column when a user row carries no creation date. */
  emptyCreated: I18nString
  /**
   * Header for the ban-state column. Supplying all three status labels opts the
   * column in; omitting them leaves it out, which is what a host without a ban
   * plugin wants. The column is additionally suppressed when no row actually
   * carries a `banned` value, so asking for it costs nothing where the server
   * has nothing to say.
   */
  columnStatus?: I18nString
  statusBanned?: I18nString
  statusActive?: I18nString
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
 * optional ban state, and an optional host-supplied action cell. No data
 * fetching, router, or auth client — feed it `users` and translated `labels`.
 * What a user is allowed to do is not a column here: authorization is
 * scope-based, so it lives in the roles drawer. Shared by the OSS
 * AdminUsersPage (fed by the `admin:listUsers` RPC) and Fabric's stage Users
 * tab (fed by a server-brokered RPC).
 */
export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  labels,
  renderActions,
}) => {
  // Mirrors UsersDirectoryPanel: the column appears only where the host asked
  // for it *and* the server reported ban state for someone. Either alone would
  // render a column that is always empty.
  const showStatus =
    labels.columnStatus !== undefined &&
    labels.statusBanned !== undefined &&
    labels.statusActive !== undefined &&
    users.some((u) => u.banned !== undefined && u.banned !== null)

  return (
    <Table verticalSpacing="sm" highlightOnHover>
      <Table.Thead className={classes.tableHead}>
        <Table.Tr>
          <Table.Th>{labels.columnUser}</Table.Th>
          {showStatus && <Table.Th>{labels.columnStatus}</Table.Th>}
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
            {showStatus && (
              <Table.Td>
                {u.banned === undefined || u.banned === null ? null : (
                  <Badge
                    color={u.banned ? 'red' : 'gray'}
                    variant="light"
                    size="sm"
                    data-testid="user-status"
                    data-banned={u.banned ? 'true' : 'false'}
                  >
                    {u.banned ? labels.statusBanned : labels.statusActive}
                  </Badge>
                )}
              </Table.Td>
            )}
            <Table.Td>
              <Text size="sm" c="dimmed">
                {u.createdAt
                  ? asI18n(new Date(u.createdAt).toLocaleDateString())
                  : labels.emptyCreated}
              </Text>
            </Table.Td>
            {renderActions && <Table.Td>{renderActions(u)}</Table.Td>}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
