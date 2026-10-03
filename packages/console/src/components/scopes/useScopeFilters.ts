import { useMemo, useState } from 'react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useDeclaredScopes, useRoles } from '../../hooks/useScopes'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import type { ShellHeaderFilter } from '../ui/shellHeaderShared'
import { NO_ROLE, groupScopesBySource, type ScopeSource } from './scope-sources'

const ALL = 'all'

const sourceLabel = (source: ScopeSource) => {
  switch (source.kind) {
    case 'addon':
      return asI18n(source.displayName ?? source.package)
    case 'app':
      return m.scopes_source_app_title()
    case 'generated':
      return m.scopes_source_generated_title()
    case 'other':
      return m.scopes_source_other_title()
    case 'removed':
      return m.scopes_source_removed_title()
  }
}

/**
 * The Permissions page's role and source filters, as header chips. The page
 * owns the state so the header and the cards read the same selection.
 */
export const useScopeFilters = () => {
  const [role, setRole] = useState(ALL)
  const [source, setSource] = useState(ALL)
  const roles = useRoles().data?.roles
  const scopes = useDeclaredScopes().data?.scopes
  const { meta } = usePikkuMeta()
  const sources = useMemo(
    () => groupScopesBySource(scopes ?? [], meta.scopes),
    [scopes, meta.scopes]
  )

  const headerFilters: ShellHeaderFilter[] = [
    {
      key: 'role',
      label: m.scopes_filter_role(),
      value: role,
      priority: 2,
      onChange: setRole,
      testId: 'scope-filter-role',
      options: [
        { value: ALL, label: m.scopes_filter_any_role() },
        { value: NO_ROLE, label: m.scopes_filter_no_role() },
        ...(roles ?? []).map((entry) => ({
          value: entry.name,
          label: asI18n(entry.name),
        })),
      ],
    },
    {
      key: 'source',
      label: m.scopes_filter_source(),
      value: source,
      priority: 1,
      onChange: setSource,
      testId: 'scope-filter-source',
      options: [
        { value: ALL, label: m.scopes_filter_any_source() },
        ...sources.map((entry) => ({
          value: entry.key,
          label: sourceLabel(entry),
        })),
      ],
    },
  ]

  return {
    headerFilters,
    role: role === ALL ? null : role,
    source: source === ALL ? null : source,
  }
}
