import { Box, Checkbox, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  isScopeRowDisabled,
  isScopeHeld,
  isScopeLockedByProvenance,
  scopeProvenance,
  toggleScope,
  toScopeTreeRows,
  type DeclaredScope,
  type HeldRole,
} from './scope-tree'

type ScopeTreeSelectorProps = {
  scopes: DeclaredScope[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  /** Roles the subject holds, so a scope one carries reads as held here too. */
  heldRoles?: HeldRole[]
}

/**
 * Renders the declared scope vocabulary as an indented list of checkboxes,
 * ticked according to what the subject actually holds. Granting a parent grants
 * everything nested beneath it, so its descendants read as selected and lock —
 * matching the runtime, where holding a parent scope satisfies every
 * descendant. A scope a held role carries reads the same way, and names the
 * role, because the session carries it just as surely as a direct grant does.
 */
export const ScopeTreeSelector: React.FC<ScopeTreeSelectorProps> = ({
  scopes,
  selected,
  onChange,
  disabled = false,
  heldRoles = [],
}) => {
  const rows = toScopeTreeRows(scopes)

  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm" py="sm">
        {m.scopes_none_declared()}
      </Text>
    )
  }

  return (
    <Stack gap={0}>
      {rows.map((row) => {
        const provenance = scopeProvenance(row.id, selected, heldRoles)
        const checked = isScopeHeld(provenance)
        const locked = isScopeLockedByProvenance(provenance)
        return (
          <Box
            key={row.id}
            py={4}
            ml={row.depth ? 10 : 0}
            pl={row.depth ? 12 : 0}
            style={
              row.depth
                ? {
                    borderInlineStart:
                      '1px solid var(--mantine-color-default-border)',
                  }
                : undefined
            }
          >
            <Checkbox
              size="xs"
              checked={checked}
              onChange={() => onChange(toggleScope(selected, row.id))}
              disabled={isScopeRowDisabled(row, checked, disabled) || locked}
              aria-label={
                row.description ? `${row.id} — ${row.description}` : row.id
              }
              data-testid="scope-checkbox"
              data-scope-id={row.id}
              styles={{ labelWrapper: { minWidth: 0 } }}
              label={
                <Group gap={8} wrap="nowrap" align="baseline">
                  <Text size="sm" fw={row.hasChildren ? 600 : 400}>
                    {asI18n(row.segment)}
                  </Text>
                  {row.description && (
                    <Text size="xs" c="dimmed" truncate="end">
                      {asI18n(row.description)}
                    </Text>
                  )}
                  {provenance.roles.length > 0 && !provenance.direct && (
                    <Text
                      size="xs"
                      c="dimmed"
                      fs="italic"
                      style={{ flexShrink: 0 }}
                    >
                      {m.scopes_granted_via_role({
                        roles: provenance.roles.join(', '),
                      })}
                    </Text>
                  )}
                  {!row.declared && (
                    <Text size="xs" c="orange" style={{ flexShrink: 0 }}>
                      {m.scopes_state_stale()}
                    </Text>
                  )}
                </Group>
              }
            />
          </Box>
        )
      })}
    </Stack>
  )
}
