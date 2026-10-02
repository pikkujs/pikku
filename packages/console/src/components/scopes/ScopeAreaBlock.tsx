import React from 'react'
import { Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { Role } from '../../hooks/useScopes'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import type { DeclaredScope } from './scope-tree'
import type { ScopeArea, ScopeGroup } from './scope-sources'

const covers = (held: string, id: string) =>
  held === id || id.startsWith(`${held}:`)

export const humanise = (segment: string) =>
  segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())

export const scopeLabel = (scope: DeclaredScope): I18nNode =>
  asI18n(scope.description || humanise(scope.id.split(':').pop() ?? scope.id))

const rolesFor = (roles: Role[], id: string) =>
  roles
    .filter((role) => role.scopes.some((held) => covers(held, id)))
    .map((role) => role.name)

/**
 * Who holds a group. Roles that carry the whole group are named on its header;
 * when only some of its lines are carried, those lines name their own roles and
 * the header stays quiet rather than claiming nobody holds any of it.
 */
const groupHolders = (roles: Role[] | undefined, group: ScopeGroup) => {
  if (!roles) return { whole: undefined, anyHeld: false }
  const whole = rolesFor(roles, group.head.id)
  const anyHeld =
    whole.length > 0 ||
    group.leaves.some((leaf) => rolesFor(roles, leaf.id).length > 0)
  return { whole, anyHeld }
}

type ScopeAreaBlockProps = {
  area: ScopeArea
  roles?: Role[]
  showHeading: boolean
}

export const ScopeAreaBlock: React.FC<ScopeAreaBlockProps> = ({
  area,
  roles,
  showHeading,
}) => {
  const whole = roles ? rolesFor(roles, area.id) : []
  return (
    <Stack gap="xs" data-testid={`scope-area-${area.id}`}>
      {showHeading && (
        <Group justify="space-between" wrap="wrap" gap="xs" mt="xs">
          <Stack gap={2}>
            <Text fw={600} size="sm">
              {asI18n(area.displayName ?? humanise(area.id))}
            </Text>
            {area.description && (
              <Text size="sm" c="dimmed">
                {asI18n(area.description)}
              </Text>
            )}
          </Stack>
          {whole.length > 0 && (
            <StatusBadge tone="info">
              {m.scopes_area_given_to({ roles: whole.join(', ') })}
            </StatusBadge>
          )}
        </Group>
      )}
      {area.groups.map((group) => {
        const { whole: groupRoles, anyHeld } = groupHolders(roles, group)
        const stale = !group.head.declared
        return (
          <Box
            key={group.head.id}
            data-testid="scope-row"
            data-scope-id={group.head.id}
            data-interactive="false"
          >
            <CardRow
              leading={
                <StatusTile
                  tone={stale ? 'warn' : anyHeld ? 'good' : 'neutral'}
                >
                  {stale ? <ShieldOff size={18} /> : <KeyRound size={18} />}
                </StatusTile>
              }
              title={scopeLabel(group.head)}
              badges={
                stale ? (
                  <StatusBadge tone="warn" size="sm">
                    {m.scopes_stale_badge()}
                  </StatusBadge>
                ) : undefined
              }
              meta={
                !groupRoles
                  ? undefined
                  : groupRoles.length > 0
                    ? m.scopes_given_to({ roles: groupRoles.join(', ') })
                    : anyHeld
                      ? undefined
                      : m.scopes_given_to_nobody()
              }
            >
              {group.leaves.length > 0 && (
                <Stack gap={6} mt="sm" pl={{ base: 0, sm: 52 }}>
                  {group.leaves.map((leaf) => {
                    const extra = roles
                      ? rolesFor(roles, leaf.id).filter(
                          (name) => !groupRoles?.includes(name)
                        )
                      : []
                    return (
                      <Group
                        key={leaf.id}
                        gap="xs"
                        wrap="wrap"
                        justify="space-between"
                        data-testid="scope-row"
                        data-scope-id={leaf.id}
                        data-interactive="false"
                      >
                        <Group
                          gap={8}
                          wrap="nowrap"
                          miw={0}
                          style={{ flex: '1 1 240px' }}
                        >
                          <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                          <Text
                            size="sm"
                            c={leaf.declared ? undefined : 'dimmed'}
                          >
                            {scopeLabel(leaf)}
                          </Text>
                        </Group>
                        {!leaf.declared ? (
                          <StatusBadge tone="warn" size="sm">
                            {m.scopes_stale_badge()}
                          </StatusBadge>
                        ) : extra.length > 0 ? (
                          <Text size="xs" c="dimmed">
                            {m.scopes_given_to({ roles: extra.join(', ') })}
                          </Text>
                        ) : null}
                      </Group>
                    )
                  })}
                </Stack>
              )}
            </CardRow>
          </Box>
        )
      })}
    </Stack>
  )
}
