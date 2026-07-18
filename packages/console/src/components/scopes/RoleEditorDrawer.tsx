import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Divider,
  Drawer,
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

type RoleEditorDrawerProps = {
  opened: boolean
  onClose: () => void
  /** The role being edited, or `null` to create a new one. */
  role: EditableRole | null
  declaredScopes: DeclaredScope[]
}

/**
 * Right drawer for composing a role from the declared scope vocabulary. Creates
 * a new role or edits an existing one — the name is immutable once created, so
 * it is read-only in edit mode.
 */
export const RoleEditorDrawer: React.FC<RoleEditorDrawerProps> = ({
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

  const createRole = useCreateRole()
  const setRoleScopes = useSetRoleScopes()
  const deleteRole = useDeleteRole()

  useEffect(() => {
    if (opened) {
      setName(role?.name ?? '')
      setDescription(role?.description ?? '')
      setSelected(role?.scopes ?? [])
      setConfirmingDelete(false)
    }
  }, [opened, role])

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )

  const pending =
    createRole.isPending || setRoleScopes.isPending || deleteRole.isPending

  const save = async () => {
    if (isNew) {
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

  const error = (
    createRole.error ||
    setRoleScopes.error ||
    deleteRole.error
  ) as Error | null

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={480}
      title={
        isNew ? m.scopes_create_role() : m.scopes_edit_role({ name: role.name })
      }
    >
      <Stack gap="md">
        <TextInput
          label={m.scopes_name()}
          placeholder={m.scopes_name_placeholder()}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={!isNew}
          data-autofocus={isNew}
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
        <Divider label={m.scopes_in_this_role()} labelPosition="left" />
        <Box mah={360} style={{ overflowY: 'auto' }}>
          <ScopeTreeSelector
            scopes={declaredScopes}
            selected={selected}
            onToggle={toggle}
          />
        </Box>
        {error && (
          <Text c="red" size="sm">
            {asI18n(error.message)}
          </Text>
        )}
        <Group justify="space-between" mt="sm">
          {!isNew ? (
            <Button
              color="red"
              variant={confirmingDelete ? 'filled' : 'subtle'}
              leftSection={<Trash2 size={14} />}
              onClick={remove}
              loading={deleteRole.isPending}
            >
              {confirmingDelete
                ? m.scopes_delete_confirm({ name: role.name })
                : m.scopes_delete_role()}
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={save}
            loading={pending && !deleteRole.isPending}
            disabled={isNew && name.trim().length === 0}
          >
            {m.common_save()}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  )
}
