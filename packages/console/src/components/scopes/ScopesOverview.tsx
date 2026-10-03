import React, { useMemo } from 'react'
import { Button, Divider, SimpleGrid, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { RotateCw } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useDeclaredScopes, useRoles } from '../../hooks/useScopes'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { SectionCard } from '../ui/SectionCard'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevNote } from '../ui/DevDetail'
import { isForbiddenScopeError } from './scope-error'
import { ConsoleLoading } from '../ui/ConsoleLoading'
import { ScopeSourceCard } from './ScopeSourceCard'
import {
  filterScopes,
  groupScopesBySource,
  sourcePermissionCount,
} from './scope-sources'

const fact = (label: I18nNode, value: I18nNode) => (
  <Stack gap={4}>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Text size="sm" fw={500}>
      {value}
    </Text>
  </Stack>
)

type ScopesOverviewProps = {
  search: string
  role: string | null
  source: string | null
}

export const ScopesOverview: React.FC<ScopesOverviewProps> = ({
  search,
  role,
  source: sourceKey,
}) => {
  const declaredQuery = useDeclaredScopes()
  const rolesQuery = useRoles()
  const roles = rolesQuery.data?.roles
  const scopes = useMemo(
    () => declaredQuery.data?.scopes ?? [],
    [declaredQuery.data]
  )
  const filtering = !!search.trim() || !!role || !!sourceKey
  const visible = useMemo(
    () => filterScopes(scopes, { search, role, roles }),
    [scopes, search, role, roles]
  )
  const { meta } = usePikkuMeta()
  const sources = useMemo(
    () =>
      groupScopesBySource(visible, meta.scopes).filter(
        (source) => !sourceKey || source.key === sourceKey
      ),
    [visible, meta.scopes, sourceKey]
  )
  const allSources = useMemo(
    () => groupScopesBySource(scopes, meta.scopes),
    [scopes, meta.scopes]
  )

  if (declaredQuery.isLoading) {
    return <ConsoleLoading h="60vh" />
  }

  if (declaredQuery.isError) {
    const error = declaredQuery.error
    const forbidden = isForbiddenScopeError(error)
    return (
      <>
        <SectionCard
          testId={forbidden ? 'scopes-forbidden' : 'scopes-load-failed'}
          title={
            forbidden
              ? m.scopes_forbidden_title()
              : m.scopes_load_failed_title()
          }
          blurb={
            forbidden
              ? m.scopes_forbidden_blurb()
              : m.scopes_load_failed_blurb()
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
  const totalPermissions = allSources.reduce(
    (sum, source) => sum + sourcePermissionCount(source),
    0
  )
  const addonCount = allSources.filter(
    (source) => source.kind === 'addon'
  ).length

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
          {fact(m.scopes_fact_permissions(), asI18n(String(totalPermissions)))}
          {fact(m.scopes_fact_addons(), asI18n(String(addonCount)))}
          {fact(
            m.scopes_fact_roles(),
            roles ? asI18n(String(roles.length)) : m.scopes_fact_roles_unknown()
          )}
        </SimpleGrid>
        {rolesQuery.isError && (
          <Text size="sm" c="dimmed" mt="md">
            {m.scopes_roles_unavailable()}
          </Text>
        )}
      </SectionCard>

      {sources.length === 0 && (
        <SectionCard
          testId="scopes-no-match"
          title={
            search.trim()
              ? m.scopes_no_match_title({ search })
              : m.scopes_no_match_filters_title()
          }
          blurb={
            role || sourceKey
              ? m.scopes_no_match_filters_blurb()
              : m.scopes_no_match_blurb()
          }
        />
      )}

      {sources.map((source) => (
        <ScopeSourceCard
          key={source.key}
          source={source}
          roles={roles}
          defaultOpen={source.kind === 'app'}
          forceOpen={filtering}
        />
      ))}

      {staleCount > 0 && !filtering && (
        <ForDevelopers label={m.scopes_dev_label()} testId="scopes-prune-dev">
          <DevNote>{m.scopes_dev_prune()}</DevNote>
        </ForDevelopers>
      )}
    </>
  )
}
