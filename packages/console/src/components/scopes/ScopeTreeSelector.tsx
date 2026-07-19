import { Box, Checkbox, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import {
  isScopeRowDisabled,
  isScopeSelected,
  isScopeLockedByAncestor,
  toggleScope,
  toScopeTreeRows,
  type DeclaredScope,
} from './scope-tree'

type ScopeTreeSelectorProps = {
  scopes: DeclaredScope[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * Renders the declared scope vocabulary as an indented list of checkboxes.
 * Granting a parent grants everything nested beneath it, so its descendants
 * read as selected and lock — matching the runtime, where holding a parent
 * scope satisfies every descendant.
 */
export const ScopeTreeSelector: React.FC<ScopeTreeSelectorProps> = ({
  scopes,
  selected,
  onChange,
  disabled = false,
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
    <Stack gap={2}>
      {rows.map((row) => {
        const checked = isScopeSelected(selected, row.id)
        const locked = isScopeLockedByAncestor(selected, row.id)
        return (
        <Box key={row.id} pl={row.depth * 20}>
          <Checkbox
            checked={checked}
            onChange={() => onChange(toggleScope(selected, row.id))}
            disabled={isScopeRowDisabled(row, checked, disabled) || locked}
            aria-label={
              row.description ? `${row.id} — ${row.description}` : row.id
            }
            label={
              <Group gap={8} wrap="nowrap">
                <Text size="sm" fw={row.hasChildren ? 600 : 400}>
                  {asI18n(row.segment)}
                </Text>
                {row.description && (
                  <Text size="xs" c="dimmed">
                    {asI18n(row.description)}
                  </Text>
                )}
                {!row.declared && (
                  <Text size="xs" c="orange">
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
