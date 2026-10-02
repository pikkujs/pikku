import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Trash2 } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { DeclaredScope } from './scope-tree'
import { ScopeTreeSelector } from './ScopeTreeSelector'
import { coveredPermissionCount, declaredPermissions } from './role-model'
import { ConsolePanel } from '../shell/ConsolePanel'
import {
  useCreateRole,
  useDeleteRole,
  useSetRoleScopes,
} from '../../hooks/useScopes'

export type EditableRole = {
  name: string
  description?: string
  scopes: string[]
}

type RoleEditorPanelProps = {
  opened: boolean
  onClose: () => void
  /** The role being edited, or `null` to create a new one. */
  role: EditableRole | null
  declaredScopes: DeclaredScope[]
}

/**
 * End-edge panel for composing a role from the declared scope vocabulary. Creates
 * a new role or edits an existing one — the name is immutable once created, so
 * it is read-only in edit mode.
 */
export const RoleEditorPanel: React.FC<RoleEditorPanelProps> = ({
  opened,
  onClose,
  role,
  declaredScopes,
}) => {
  const isNew = role === null
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const createRole = useCreateRole()
  const setRoleScopes = useSetRoleScopes()
  const deleteRole = useDeleteRole()

  useEffect(() => {
    if (opened) {
      setName(role?.name ?? '')
      setDescription(role?.description ?? '')
      setSelected(role?.scopes ?? [])
      setConfirmingDelete(false)
      setNameError(null)
    }
  }, [opened, role])

  const pending =
    createRole.isPending || setRoleScopes.isPending || deleteRole.isPending

  const save = async () => {
    if (isNew) {
      if (name.trim().length === 0) {
        setNameError(m.scopes_name_required())
        return
      }
      await createRole.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        scopes: selected,
      })
    } else {
      await setRoleScopes.mutateAsync({ name: role.name, scopes: selected })
    }
    onClose()
  }

  const remove = async () => {
    if (isNew) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    await deleteRole.mutateAsync(role.name)
    onClose()
  }

  const covered = coveredPermissionCount(selected, declaredScopes)
  const total = declaredPermissions(declaredScopes).length

  const error = (createRole.error ||
    setRoleScopes.error ||
    deleteRole.error) as Error | null

  return (
    <ConsolePanel
      opened={opened}
      onClose={onClose}
      width="lg"
      testId="role-editor-panel"
      title={
        isNew ? m.scopes_create_role() : m.scopes_edit_role({ name: role.name })
      }
      footer={
        <Group justify="space-between" w="100%">
          {!isNew ? (
            <Button
              color="red"
              variant={confirmingDelete ? 'filled' : 'subtle'}
              leftSection={<Trash2 size={14} />}
              onClick={remove}
              loading={deleteRole.isPending}
              data-testid="role-delete"
            >
              {confirmingDelete
                ? m.scopes_delete_confirm({ name: role.name })
                : m.scopes_delete_role()}
            </Button>
          ) : (
            <span />
          )}
          <Group gap="sm">
            <Button variant="subtle" onClick={onClose} disabled={pending}>
              {m.common_cancel()}
            </Button>
            <Button
              onClick={save}
              loading={pending && !deleteRole.isPending}
              data-testid="role-save"
            >
              {isNew ? m.scopes_create_role() : m.roles_editor_save()}
            </Button>
          </Group>
        </Group>
      }
    >
      <Stack gap="md" data-testid="role-editor">
        <Text size="sm" c="dimmed">
          {isNew ? m.roles_editor_new_body() : m.roles_editor_edit_body()}
        </Text>
        <TextInput
          label={m.scopes_name()}
          placeholder={m.scopes_name_placeholder()}
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value)
            if (nameError) {
              setNameError(null)
            }
          }}
          disabled={!isNew}
          withAsterisk={isNew}
          error={nameError}
          data-autofocus={isNew}
          data-testid="role-name-input"
        />
        <Textarea
          label={m.scopes_col_description()}
          placeholder={m.scopes_description_placeholder()}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          disabled={!isNew}
          description={!isNew ? m.scopes_description_locked() : undefined}
          autosize
          minRows={1}
        />
        <Stack gap={4} mt="xs">
          <Text fw={600}>{m.roles_editor_allows()}</Text>
          <Text size="sm" c="dimmed" data-testid="role-editor-count">
            {covered === 0
              ? m.roles_row_allows_nothing()
              : covered === 1
                ? m.roles_row_allows_one({ total })
                : m.roles_row_allows({ count: covered, total })}
          </Text>
        </Stack>
        <ScopeTreeSelector
          scopes={declaredScopes}
          selected={selected}
          onChange={setSelected}
        />
        {error && (
          <Alert color="red" variant="light">
            <Text size="sm">{asI18n(error.message)}</Text>
          </Alert>
        )}
      </Stack>
    </ConsolePanel>
  )
}
