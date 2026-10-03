import { useMemo } from 'react'
import { Button, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Plus, RotateCw } from 'lucide-react'
import { RoleEditorPanel, type EditableRole } from './RoleEditorPanel'
import { RoleRow } from './RoleRow'
import { RolesSummary } from './RolesSummary'
import { isForbiddenScopeError } from './scope-error'
import { useRoles, useDeclaredScopes } from '../../hooks/useScopes'
import { SectionCard } from '../ui/SectionCard'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevMono, DevNote, DevTable } from '../ui/DevDetail'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { m } from '@/i18n/messages'

type RolesListProps = {
  search: string
  editing: EditableRole | null
  panelOpen: boolean
  onOpenRole: (role: EditableRole | null) => void
  onClosePanel: () => void
}

/**
 * The Roles surface: a list of admin-composed roles, each editable in a drawer
 * that composes it from the declared scope vocabulary. Search lives in the page
 * header, so it is passed in from RolesPage; the create action sits on the list
 * card it adds to.
 */
export const RolesList: React.FC<RolesListProps> = ({
  search,
  editing,
  panelOpen,
  onOpenRole,
  onClosePanel,
}) => {
  const rolesQuery = useRoles()
  const declaredQuery = useDeclaredScopes()

  const roles = useMemo(() => rolesQuery.data?.roles ?? [], [rolesQuery.data])
  const declaredScopes = useMemo(
    () => declaredQuery.data?.scopes ?? [],
    [declaredQuery.data]
  )
  const needle = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      needle
        ? roles.filter(
            (role) =>
              role.name.toLowerCase().includes(needle) ||
              (role.description ?? '').toLowerCase().includes(needle)
          )
        : roles,
    [roles, needle]
  )

  const loadError = rolesQuery.error || declaredQuery.error
  if (loadError) {
    const forbidden = isForbiddenScopeError(loadError)
    return (
      <>
        <SectionCard
          testId={forbidden ? 'roles-forbidden' : 'roles-load-error'}
          title={
            forbidden ? m.roles_forbidden_title() : m.roles_load_failed_title()
          }
          blurb={
            forbidden ? m.roles_forbidden_blurb() : m.roles_load_failed_blurb()
          }
          right={
            forbidden ? undefined : (
              <Button
                variant="default"
                leftSection={<RotateCw size={14} />}
                loading={rolesQuery.isFetching || declaredQuery.isFetching}
                onClick={() => {
                  void rolesQuery.refetch()
                  void declaredQuery.refetch()
                }}
              >
                {m.scopes_retry()}
              </Button>
            )
          }
        />
        <ForDevelopers label={m.scopes_dev_label()} testId="roles-error-dev">
          <DevNote>
            {forbidden
              ? m.scopes_roles_forbidden_body()
              : loadError instanceof Error
                ? asI18n(loadError.message)
                : m.roles_load_failed_blurb()}
          </DevNote>
        </ForDevelopers>
      </>
    )
  }

  const loading = rolesQuery.isLoading || declaredQuery.isLoading
  const empty = !loading && roles.length === 0

  return (
    <>
      {!loading && !needle && roles.length > 0 && (
        <RolesSummary roles={roles} declaredScopes={declaredScopes} />
      )}
      <SectionCard
        testId="roles-list"
        title={m.scopes_roles_title()}
        subtitle={
          loading || empty
            ? undefined
            : visible.length === 1
              ? m.roles_list_count_one()
              : m.roles_list_count({ count: visible.length })
        }
        blurb={empty ? m.roles_list_empty_blurb() : m.roles_list_blurb()}
        right={
          <Button
            size="lg"
            leftSection={<Plus size={16} />}
            onClick={() => onOpenRole(null)}
            data-testid="scopes-create-role"
          >
            {m.scopes_create_role()}
          </Button>
        }
        footer={
          visible.length > 0 ? (
            <ForDevelopers
              attached
              label={m.scopes_dev_label()}
              hint={m.roles_dev_hint()}
              testId="roles-developers"
            >
              <DevTable
                columns={[m.roles_dev_col_role(), m.roles_dev_col_scopes()]}
                rows={visible.map((role) => ({
                  key: role.name,
                  cells: [
                    <DevMono key="name" value={role.name} copy />,
                    role.scopes.length > 0 ? (
                      <DevMono key="scopes" value={role.scopes.join(', ')} />
                    ) : (
                      <Text key="scopes" size="sm" c="dimmed">
                        {m.roles_dev_none()}
                      </Text>
                    ),
                  ],
                }))}
              />
            </ForDevelopers>
          ) : undefined
        }
      >
        {loading ? (
          <ConsoleLoading py="xl" />
        ) : empty ? null : visible.length === 0 ? (
          <Text size="sm" c="dimmed" mt="md">
            {m.roles_no_match({ search: search.trim() })}
          </Text>
        ) : (
          <Stack gap={8} mt="md">
            {visible.map((role) => (
              <RoleRow
                key={role.name}
                role={role}
                declaredScopes={declaredScopes}
                onOpen={onOpenRole}
                selected={panelOpen && editing?.name === role.name}
              />
            ))}
          </Stack>
        )}
      </SectionCard>
      <RoleEditorPanel
        opened={panelOpen}
        onClose={onClosePanel}
        role={editing}
        declaredScopes={declaredScopes}
      />
    </>
  )
}
