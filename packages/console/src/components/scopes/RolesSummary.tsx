import React from 'react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { SummaryCard } from '../ui/SummaryCard'
import type { Role } from '../../hooks/useScopes'
import type { DeclaredScope } from './scope-tree'
import { coveredPermissionCount, declaredPermissions } from './role-model'

type RolesSummaryProps = {
  roles: Role[]
  declaredScopes: DeclaredScope[]
}

export const RolesSummary: React.FC<RolesSummaryProps> = ({
  roles,
  declaredScopes,
}) => {
  const total = declaredPermissions(declaredScopes).length
  const givenOut = coveredPermissionCount(
    roles.flatMap((role) => role.scopes),
    declaredScopes
  )
  const empty = roles.filter(
    (role) => coveredPermissionCount(role.scopes, declaredScopes) === 0
  ).length

  return (
    <SummaryCard
      testId="roles-summary"
      title={
        roles.length === 1
          ? m.roles_hero_title_one()
          : m.roles_hero_title({ count: roles.length })
      }
      blurb={m.roles_hero_blurb()}
      facts={[
        { label: m.roles_fact_roles(), value: asI18n(String(roles.length)) },
        {
          label: m.roles_fact_given_out(),
          value: m.roles_fact_of({ done: givenOut, total }),
        },
        {
          label: m.roles_fact_empty(),
          value: asI18n(String(empty)),
          tone: empty > 0 ? 'warn' : undefined,
        },
      ]}
    />
  )
}
