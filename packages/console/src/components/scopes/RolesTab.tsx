import { Alert, Badge, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { UsersRound } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { RoleEditorDrawer, type EditableRole } from './RoleEditorDrawer'
import { isForbiddenScopeError } from './scope-error'
import { useRoles, useDeclaredScopes } from '../../hooks/useScopes'
import { m } from '@/i18n/messages'

const DOCS_HREF = 'https://pikku.dev/docs/authentication/scopes'

type RolesTabProps = {
  search: string
  editing: EditableRole | null
  drawerOpen: boolean
  onOpenRole: (role: EditableRole | null) => void
  onCloseDrawer: () => void
}

/**
 * The Roles surface: a list of admin-composed roles, each editable in a drawer
 * that composes it from the declared scope vocabulary. Search and the create
 * action live in the page header, so both are passed in from ScopesPage.
 */
export const RolesTab: React.FC<RolesTabProps> = ({
  search,
  editing,
  drawerOpen,
  onOpenRole,
  onCloseDrawer,
}) => {
  const rolesQuery = useRoles()
  const declaredQuery = useDeclaredScopes()

  const roles = rolesQuery.data?.roles ?? []
  const declaredScopes = declaredQuery.data?.scopes ?? []

  const loadError = rolesQuery.error || declaredQuery.error
  if (loadError) {
    if (isForbiddenScopeError(loadError)) {
      return (
        <Alert color="yellow" title={m.scopes_roles_forbidden_title()}>
          {m.scopes_roles_forbidden_body()}
        </Alert>
      )
    }
    return (
      <Alert color="red" title={m.scopes_roles_load_error()}>
        {loadError instanceof Error ? asI18n(loadError.message) : null}
      </Alert>
    )
  }

  return (
    <>
      <TableListPage
        icon={UsersRound}
        title={m.scopes_roles_title()}
        docsHref={DOCS_HREF}
        data={roles}
        getKey={(role) => role.name}
        onRowClick={(role) => onOpenRole(role)}
        loading={rolesQuery.isLoading}
        externalSearch={search}
        searchFilter={(role, q) =>
          role.name.toLowerCase().includes(q) ||
          (role.description ?? '').toLowerCase().includes(q)
        }
        emptyTitle={m.scopes_no_roles_title()}
        emptyDescription={m.scopes_no_roles_description()}
        columns={[
          {
            key: 'name',
            header: m.scopes_col_role(),
            render: (role) => (
              <Text size="sm" fw={500}>
                {asI18n(role.name)}
              </Text>
            ),
          },
          {
            key: 'description',
            header: m.scopes_col_description(),
            render: (role) => (
              <Text size="sm" c="dimmed">
                {asI18n(role.description || '—')}
              </Text>
            ),
          },
          {
            key: 'scopes',
            header: m.scopes_col_scopes(),
            align: 'right',
            width: 100,
            render: (role) => (
              <Badge variant="light" color="gray" size="sm">
                {role.scopes.length}
              </Badge>
            ),
          },
        ]}
      />
      <RoleEditorDrawer
        opened={drawerOpen}
        onClose={onCloseDrawer}
        role={editing}
        declaredScopes={declaredScopes}
      />
    </>
  )
}
