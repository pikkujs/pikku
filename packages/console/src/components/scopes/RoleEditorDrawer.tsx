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

  const createRole = useCreateRole()
  const setRoleScopes = useSetRoleScopes()
  const deleteRole = useDeleteRole()

  useEffect(() => {
    if (opened) {
      setName(role?.name ?? '')
      setDescription(role?.description ?? '')
      setSelected(role?.scopes ?? [])
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
      title={isNew ? asI18n('Create role') : asI18n(`Edit ${role.name}`)}
    >
      <Stack gap="md">
        <TextInput
          label={asI18n('Name')}
          placeholder={asI18n('billing-admin')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={!isNew}
          data-autofocus={isNew}
        />
        <Textarea
          label={asI18n('Description')}
          placeholder={asI18n('What this role is for')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={1}
        />
        <Divider label={asI18n('Scopes in this role')} labelPosition="left" />
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
              variant="subtle"
              leftSection={<Trash2 size={14} />}
              onClick={remove}
              loading={deleteRole.isPending}
            >
              {asI18n('Delete role')}
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={save}
            loading={pending && !deleteRole.isPending}
            disabled={isNew && name.trim().length === 0}
          >
            {asI18n('Save')}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  )
}
