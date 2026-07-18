import { useState } from 'react'
import { Alert, Badge, Button, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Plus, UsersRound } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { RoleEditorDrawer, type EditableRole } from './RoleEditorDrawer'
import { useRoles, useDeclaredScopes } from '../../hooks/useScopes'
import { m } from '@/i18n/messages'

const DOCS_HREF = 'https://pikku.dev/docs/authentication/scopes'

/**
 * The Roles surface: a list of admin-composed roles, each editable in a drawer
 * that composes it from the declared scope vocabulary.
 */
export const RolesTab: React.FC = () => {
  const rolesQuery = useRoles()
  const declaredQuery = useDeclaredScopes()
  const [editing, setEditing] = useState<EditableRole | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const roles = rolesQuery.data?.roles ?? []
  const declaredScopes = declaredQuery.data?.scopes ?? []

  const open = (role: EditableRole | null) => {
    setEditing(role)
    setDrawerOpen(true)
  }

  const loadError = (rolesQuery.error || declaredQuery.error) as Error | null
  if (loadError) {
    return (
      <Alert color="red" title={m.scopes_roles_load_error()}>
        {asI18n(loadError.message)}
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
        onRowClick={(role) => open(role)}
        loading={rolesQuery.isLoading}
        searchPlaceholder={m.scopes_search_roles()}
        searchFilter={(role, q) =>
          role.name.toLowerCase().includes(q) ||
          (role.description ?? '').toLowerCase().includes(q)
        }
        emptyTitle={m.scopes_no_roles_title()}
        emptyDescription={m.scopes_no_roles_description()}
        headerRight={
          <Button
            size="sm"
            leftSection={<Plus size={14} />}
            onClick={() => open(null)}
          >
            {m.scopes_create_role()}
          </Button>
        }
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
        onClose={() => setDrawerOpen(false)}
        role={editing}
        declaredScopes={declaredScopes}
      />
    </>
  )
}
