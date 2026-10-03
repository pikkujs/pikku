import React from 'react'
import { Badge, Box, Group, Stack, Text, Tooltip } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import {
  ChevronRight,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { CardRow } from '../ui/CardRow'
import { StatusBadge } from '../ui/StatusBadge'
import { StatusTile } from '../ui/StatusTile'
import type { Role } from '../../hooks/useScopes'
import type { DeclaredScope } from './scope-tree'
import {
  coveredPermissionCount,
  declaredPermissions,
  describeGrants,
} from './role-model'

const SHOWN_GRANTS = 6

type RoleRowProps = {
  role: Role
  declaredScopes: DeclaredScope[]
  onOpen: (role: Role) => void
  selected?: boolean
}

export const RoleRow: React.FC<RoleRowProps> = ({
  role,
  declaredScopes,
  onOpen,
  selected,
}) => {
  const total = declaredPermissions(declaredScopes).length
  const covered = coveredPermissionCount(role.scopes, declaredScopes)
  const grants = describeGrants(role.scopes, declaredScopes).sort(
    (a, b) => Number(b.stale) - Number(a.stale)
  )
  const shown = grants.slice(0, SHOWN_GRANTS)
  const hidden = grants.length - shown.length

  return (
    <Box
      data-testid="role-row"
      data-role-name={role.name}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(role)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(role)
        }
      }}
      style={{
        cursor: 'pointer',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <CardRow
        selected={selected}
        leading={
          <StatusTile tone={covered > 0 ? 'good' : 'neutral'}>
            {covered > 0 ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
          </StatusTile>
        }
        title={asI18n(role.name)}
        badges={
          covered === 0 ? (
            <StatusBadge tone="neutral" size="sm" dot={false}>
              {m.roles_row_allows_nothing()}
            </StatusBadge>
          ) : undefined
        }
        meta={
          <Stack gap={6}>
            {covered > 0 && (
              <span>
                {covered === 1
                  ? m.roles_row_allows_one({ total })
                  : m.roles_row_allows({ count: covered, total })}
              </span>
            )}
            {role.description && (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {asI18n(role.description)}
              </Text>
            )}
            {shown.length > 0 && (
              <Group gap={6} wrap="wrap">
                {shown.map((grant) => (
                  <Tooltip
                    key={grant.id}
                    label={asI18n(grant.description ?? grant.id)}
                    withArrow
                  >
                    <Badge
                      variant="light"
                      color={grant.stale ? 'orange' : undefined}
                      radius="sm"
                      tt="none"
                      fw={500}
                      maw="100%"
                      leftSection={
                        grant.stale ? <TriangleAlert size={11} /> : undefined
                      }
                      data-testid="role-grant"
                      data-scope-id={grant.id}
                    >
                      {grant.wholeArea
                        ? m.roles_row_whole_area({ name: grant.name })
                        : asI18n(grant.name)}
                    </Badge>
                  </Tooltip>
                ))}
                {hidden > 0 && (
                  <Badge variant="default" radius="sm" tt="none" fw={500}>
                    {m.roles_row_more({ count: hidden })}
                  </Badge>
                )}
              </Group>
            )}
          </Stack>
        }
        trailing={
          <Box visibleFrom="sm" c="dimmed" display="flex" aria-hidden>
            <ChevronRight size={16} />
          </Box>
        }
      />
    </Box>
  )
}
