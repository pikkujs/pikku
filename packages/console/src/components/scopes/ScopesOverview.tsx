import React, { useMemo } from 'react'
import {
  Box,
  Button,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { KeyRound, RotateCw, ShieldCheck, ShieldOff } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useDeclaredScopes, useRoles, type Role } from '../../hooks/useScopes'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevField, DevFields, DevNote } from '../ui/DevDetail'
import { isForbiddenScopeError } from './scope-error'
import type { DeclaredScope } from './scope-tree'
import { ConsoleLoading } from '../ui/ConsoleLoading'

type ScopeGroup = { head: DeclaredScope; leaves: DeclaredScope[] }

type ScopeArea = {
  id: string
  root?: DeclaredScope
  groups: ScopeGroup[]
  all: DeclaredScope[]
}

const covers = (held: string, id: string) =>
  held === id || id.startsWith(`${held}:`)

const humanise = (segment: string) =>
  segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())

const label = (scope: DeclaredScope): I18nNode =>
  asI18n(scope.description || humanise(scope.id.split(':').pop() ?? scope.id))

const rolesFor = (roles: Role[], id: string) =>
  roles
    .filter((role) => role.scopes.some((held) => covers(held, id)))
    .map((role) => role.name)

const toAreas = (scopes: DeclaredScope[]): ScopeArea[] => {
  const areas = new Map<string, ScopeArea>()
  for (const scope of scopes) {
    const [areaId, groupId] = scope.id.split(':')
    const area = areas.get(areaId!) ?? {
      id: areaId!,
      groups: [],
      all: [],
    }
    areas.set(areaId!, area)
    area.all.push(scope)
    if (!groupId) {
      area.root = scope
      continue
    }
    const headId = `${areaId}:${groupId}`
    let group = area.groups.find((entry) => entry.head.id === headId)
    if (!group) {
      group = {
        head:
          scopes.find((entry) => entry.id === headId) ??
          ({ id: headId, declared: true } as DeclaredScope),
        leaves: [],
      }
      area.groups.push(group)
    }
    if (scope.id !== headId) group.leaves.push(scope)
  }
  return [...areas.values()]
}

const permissionCount = (area: ScopeArea) =>
  area.groups.reduce(
    (sum, group) => sum + Math.max(group.leaves.length, 1),
    0
  ) || (area.root ? 1 : 0)

const RolesLine: React.FC<{ roles?: string[] }> = ({ roles }) => {
  if (!roles) return null
  return roles.length > 0
    ? m.scopes_given_to({ roles: roles.join(', ') })
    : m.scopes_given_to_nobody()
}

const Fact: React.FC<{ label: I18nNode; value: I18nNode }> = ({
  label: name,
  value,
}) => (
  <Stack gap={4}>
    <Text size="sm" c="dimmed">
      {name}
    </Text>
    <Text size="sm" fw={500}>
      {value}
    </Text>
  </Stack>
)

const ScopeAreaCard: React.FC<{ area: ScopeArea; roles?: Role[] }> = ({
  area,
  roles,
}) => {
  const count = permissionCount(area)
  const whole = roles ? rolesFor(roles, area.id) : []
  return (
    <SectionCard
      testId={`scope-area-${area.id}`}
      title={area.root ? label(area.root) : asI18n(humanise(area.id))}
      subtitle={
        count === 1
          ? m.scopes_area_count_one()
          : m.scopes_area_count({ count })
      }
      right={
        whole.length > 0 ? (
          <StatusBadge tone="info">
            {m.scopes_area_given_to({ roles: whole.join(', ') })}
          </StatusBadge>
        ) : undefined
      }
      footer={
        <ForDevelopers
          attached
          label={m.scopes_dev_label()}
          hint={m.scopes_dev_hint()}
          testId={`scope-area-developers-${area.id}`}
        >
          <DevFields>
            {area.all.map((scope) => (
              <DevField key={scope.id} label={label(scope)} value={scope.id}>
                <Group gap="xs" wrap="wrap">
                  <Text size="sm" ff="monospace">
                    {asI18n(scope.id)}
                  </Text>
                  {!scope.declared && (
                    <Text size="xs" c="dimmed">
                      {m.scopes_state_stale()}
                    </Text>
                  )}
                </Group>
              </DevField>
            ))}
          </DevFields>
        </ForDevelopers>
      }
    >
      <Stack gap="xs" mt="md">
        {area.groups.map((group) => {
          const groupRoles = roles ? rolesFor(roles, group.head.id) : undefined
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
                    tone={
                      stale ? 'warn' : groupRoles?.length ? 'good' : 'neutral'
                    }
                  >
                    {stale ? <ShieldOff size={18} /> : <KeyRound size={18} />}
                  </StatusTile>
                }
                title={label(group.head)}
                badges={
                  stale ? (
                    <StatusBadge tone="warn" size="sm">
                      {m.scopes_stale_badge()}
                    </StatusBadge>
                  ) : undefined
                }
                meta={<RolesLine roles={groupRoles} />}
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
                          <Group gap={8} wrap="nowrap" miw={0} style={{ flex: '1 1 240px' }}>
                            <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                            <Text size="sm" c={leaf.declared ? undefined : 'dimmed'}>
                              {label(leaf)}
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
    </SectionCard>
  )
}

export const ScopesOverview: React.FC<{ search: string }> = ({ search }) => {
  const declaredQuery = useDeclaredScopes()
  const rolesQuery = useRoles()
  const roles = rolesQuery.data?.roles
  const scopes = useMemo(
    () => declaredQuery.data?.scopes ?? [],
    [declaredQuery.data]
  )
  const needle = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      needle
        ? scopes.filter(
            (scope) =>
              scope.id.toLowerCase().includes(needle) ||
              (scope.description ?? '').toLowerCase().includes(needle)
          )
        : scopes,
    [scopes, needle]
  )
  const areas = useMemo(() => toAreas(visible), [visible])
  const allAreas = useMemo(() => toAreas(scopes), [scopes])

  if (declaredQuery.isLoading) {
    return (
      <ConsoleLoading h="60vh" />
    )
  }

  if (declaredQuery.isError) {
    const error = declaredQuery.error
    const forbidden = isForbiddenScopeError(error)
    return (
      <>
        <SectionCard
          testId={forbidden ? 'scopes-forbidden' : 'scopes-load-failed'}
          title={
            forbidden ? m.scopes_forbidden_title() : m.scopes_load_failed_title()
          }
          blurb={
            forbidden ? m.scopes_forbidden_blurb() : m.scopes_load_failed_blurb()
          }
          right={
            forbidden ? undefined : (
              <Button
                variant="default"
                leftSection={<RotateCw size={14} />}
                loading={declaredQuery.isFetching}
                onClick={() => void declaredQuery.refetch()}
              >
                {m.scopes_retry()}
              </Button>
            )
          }
        />
        <ForDevelopers label={m.scopes_dev_label()} testId="scopes-error-dev">
          <DevNote>
            {forbidden
              ? m.scopes_vocab_forbidden_body()
              : error instanceof Error
                ? asI18n(error.message)
                : m.scopes_vocab_load_error()}
          </DevNote>
        </ForDevelopers>
      </>
    )
  }

  if (scopes.length === 0) {
    return (
      <>
        <SectionCard
          testId="scopes-empty"
          title={m.scopes_empty_title()}
          blurb={m.scopes_empty_blurb()}
        />
        <ForDevelopers label={m.scopes_dev_label()} testId="scopes-empty-dev">
          <DevNote>{m.scopes_no_declared_description()}</DevNote>
        </ForDevelopers>
      </>
    )
  }

  const staleCount = scopes.filter((scope) => !scope.declared).length
  const totalPermissions = allAreas.reduce(
    (sum, area) => sum + permissionCount(area),
    0
  )

  return (
    <>
      <SectionCard
        testId="scopes-summary"
        hero
        title={m.scopes_hero_title()}
        blurb={m.scopes_hero_blurb()}
        badges={
          staleCount > 0 ? (
            <StatusBadge tone="warn">
              {m.scopes_stale_count({ count: staleCount })}
            </StatusBadge>
          ) : undefined
        }
      >
        <Divider my="md" />
        <SimpleGrid cols={{ base: 3 }} spacing="lg">
          <Fact
            label={m.scopes_fact_areas()}
            value={asI18n(String(allAreas.length))}
          />
          <Fact
            label={m.scopes_fact_permissions()}
            value={asI18n(String(totalPermissions))}
          />
          <Fact
            label={m.scopes_fact_roles()}
            value={
              roles
                ? asI18n(String(roles.length))
                : m.scopes_fact_roles_unknown()
            }
          />
        </SimpleGrid>
        {rolesQuery.isError && (
          <Text size="sm" c="dimmed" mt="md">
            {m.scopes_roles_unavailable()}
          </Text>
        )}
      </SectionCard>

      {areas.length === 0 && (
        <SectionCard
          testId="scopes-no-match"
          title={m.scopes_no_match_title({ search })}
          blurb={m.scopes_no_match_blurb()}
        />
      )}

      {areas.map((area) => (
        <ScopeAreaCard key={area.id} area={area} roles={roles} />
      ))}

      {staleCount > 0 && !needle && (
        <ForDevelopers label={m.scopes_dev_label()} testId="scopes-prune-dev">
          <DevNote>{m.scopes_dev_prune()}</DevNote>
        </ForDevelopers>
      )}
    </>
  )
}
