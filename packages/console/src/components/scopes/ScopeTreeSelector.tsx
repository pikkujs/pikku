import { Box, Checkbox, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { toScopeTreeRows, type DeclaredScope } from './scope-tree'

type ScopeTreeSelectorProps = {
  scopes: DeclaredScope[]
  selected: string[]
  onToggle: (id: string) => void
}

/**
 * Renders the declared scope vocabulary as an indented list of checkboxes.
 * Each node is independently grantable — ticking a parent does not tick its
 * children, matching the runtime, where a role holds an explicit set of ids
 * rather than a collapsed subtree.
 */
export const ScopeTreeSelector: React.FC<ScopeTreeSelectorProps> = ({
  scopes,
  selected,
  onToggle,
}) => {
  const rows = toScopeTreeRows(scopes)
  const held = new Set(selected)

  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm" py="sm">
        {asI18n('No scopes are declared. Add wireScope declarations in code.')}
      </Text>
    )
  }

  return (
    <Stack gap={2}>
      {rows.map((row) => (
        <Box key={row.id} pl={row.depth * 20}>
          <Checkbox
            checked={held.has(row.id)}
            onChange={() => onToggle(row.id)}
            disabled={!row.declared}
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
                    {asI18n('stale')}
                  </Text>
                )}
              </Group>
            }
          />
        </Box>
      ))}
    </Stack>
  )
}
