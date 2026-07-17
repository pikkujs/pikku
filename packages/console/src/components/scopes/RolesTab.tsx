import { useState } from 'react'
import { Badge, Button, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Plus, UsersRound } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { RoleEditorDrawer, type EditableRole } from './RoleEditorDrawer'
import { useRoles, useDeclaredScopes } from '../../hooks/useScopes'

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

  return (
    <>
      <TableListPage
        icon={UsersRound}
        title={asI18n('Roles')}
        docsHref={DOCS_HREF}
        data={roles}
        getKey={(role) => role.name}
        onRowClick={(role) => open(role)}
        loading={rolesQuery.isLoading}
        searchPlaceholder={asI18n('Search roles…')}
        searchFilter={(role, q) =>
          role.name.toLowerCase().includes(q) ||
          (role.description ?? '').toLowerCase().includes(q)
        }
        emptyTitle={asI18n('No roles yet')}
        emptyDescription={asI18n(
          'Create a role to group scopes and grant them to users.'
        )}
        headerRight={
          <Button
            size="sm"
            leftSection={<Plus size={14} />}
            onClick={() => open(null)}
          >
            {asI18n('Create role')}
          </Button>
        }
        columns={[
          {
            key: 'name',
            header: asI18n('Role'),
            render: (role) => (
              <Text size="sm" fw={500}>
                {asI18n(role.name)}
              </Text>
            ),
          },
          {
            key: 'description',
            header: asI18n('Description'),
            render: (role) => (
              <Text size="sm" c="dimmed">
                {asI18n(role.description || '—')}
              </Text>
            ),
          },
          {
            key: 'scopes',
            header: asI18n('Scopes'),
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
