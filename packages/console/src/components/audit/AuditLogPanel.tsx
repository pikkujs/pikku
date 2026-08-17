import React, { useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Drawer,
  Group,
  MultiSelect,
  Text,
} from '@pikku/mantine/core'
import { ShieldCheck } from 'lucide-react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'
import { TableListPage } from '../layout/TableListPage'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { AuditEventDetail } from './AuditEventDetail'
import { isForbiddenScopeError } from '../scopes/scope-error'
import type { AuditUserDirectory, AuditRow } from './audit-row'
import {
  OUTCOME_COLOUR,
  auditIdentity,
  userName,
  auditRowKey,
  formatOccurredAt,
  summariseMetadata,
} from './audit-row'

const DOCS_HREF = 'https://pikku.dev/docs'
const PAGE_SIZE = 50

export interface AuditLogPanelProps {
  emptyHero?: React.ReactNode
}

/**
 * The audit log body: the trail newest first, paged as the reader scrolls, and
 * narrowed by user and action.
 *
 * Both filters are applied server-side rather than over the loaded pages — a
 * client-side filter over an infinite list can only match what has already been
 * scrolled past, which for an audit trail is a wrong answer given confidently.
 */
export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ emptyHero }) => {
  useLocale()
  const rpc = usePikkuRPC()
  const [userIds, setUserIds] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])
  // The row itself, not an id: the page already holds the whole event, so a
  // second read to open a drawer would only be a chance for the two to disagree.
  const [selected, setSelected] = useState<AuditRow | null>(null)

  const filtersQuery = useQuery({
    queryKey: ['audit-filters'],
    queryFn: async () => await rpc.invoke('admin:getAuditFilters'),
    staleTime: 60 * 1000,
    retry: false,
  })

  const {
    data,
    isPending,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['audits', { userIds, types }],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      await rpc.invoke('admin:getAudits', {
        limit: PAGE_SIZE,
        offset: pageParam,
        // Omitted rather than sent empty: an empty array is a real filter that
        // matches nothing, which is not what "no selection" means here.
        ...(userIds.length ? { userIds } : {}),
        ...(types.length ? { types } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  })

  const pages = data?.pages ?? []
  const rows = useMemo(() => pages.flatMap((page) => page.events), [pages])
  // One directory across every page loaded so far: each page names only its own
  // users, and a row must keep its name once a later page has been fetched.
  const users = useMemo<AuditUserDirectory>(
    () => Object.assign({}, ...pages.map((page) => page.users)),
    [pages]
  )
  const filtered = userIds.length > 0 || types.length > 0

  const loadError = error ?? filtersQuery.error
  if (loadError) {
    if (isForbiddenScopeError(loadError)) {
      return (
        <Alert
          color="yellow"
          title={m.audit_forbidden_title()}
          data-testid="audit-forbidden"
        >
          {m.audit_forbidden_body()}
        </Alert>
      )
    }
    return (
      <Alert color="red" title={m.audit_load_error()} data-testid="audit-error">
        {loadError instanceof Error ? asI18n(loadError.message) : null}
      </Alert>
    )
  }

  // A write-only sink is not an empty trail, and conflating them would tell an
  // auditor that nothing happened when the truth is that nobody can see.
  if (pages.length > 0 && !pages[0]!.readable) {
    return (
      <EmptyStatePlaceholder
        icon={ShieldCheck}
        hero={emptyHero}
        title={m.audit_unreadable_title()}
        description={m.audit_unreadable_description()}
        docsHref={DOCS_HREF}
      />
    )
  }

  if (!isPending && rows.length === 0 && !filtered) {
    return (
      <EmptyStatePlaceholder
        icon={ShieldCheck}
        hero={emptyHero}
        title={m.audit_empty_title()}
        description={m.audit_empty_description()}
        docsHref={DOCS_HREF}
      />
    )
  }

  return (
    <>
      <TableListPage<AuditRow>
        icon={ShieldCheck}
        title={m.audit_title()}
        docsHref={DOCS_HREF}
        data={rows}
        getKey={auditRowKey}
        onRowClick={setSelected}
        getRowProps={(row) => ({
          'data-testid': 'audit-row',
          'data-audit-type': row.type,
        })}
        loading={isPending}
        emptyMessage={m.audit_no_matches()}
        emptyTitle={m.audit_empty_title()}
        emptyDescription={m.audit_empty_description()}
        emptyHero={emptyHero}
        onLoadMore={fetchNextPage}
        hasMore={hasNextPage}
        loadingMore={isFetchingNextPage}
        headerRight={
          <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
            <MultiSelect
              data-testid="audit-filter-user"
              aria-label={m.audit_filter_user()}
              placeholder={m.audit_filter_user_placeholder()}
              // Filtered by id, chosen by name: the id is what the trail
              // recorded and the only thing that stays unique, but nobody
              // recognises their colleague by it.
              data={(filtersQuery.data?.users ?? []).map((user) => ({
                value: user.userId,
                label: userName(user) ?? user.userId,
              }))}
              value={userIds}
              onChange={setUserIds}
              size="sm"
              searchable
              clearable
              style={{ flex: 1, minWidth: 0 }}
            />
            <MultiSelect
              data-testid="audit-filter-type"
              aria-label={m.audit_filter_type()}
              placeholder={m.audit_filter_type_placeholder()}
              data={filtersQuery.data?.types ?? []}
              value={types}
              onChange={setTypes}
              size="sm"
              searchable
              clearable
              style={{ flex: 1, minWidth: 0 }}
            />
          </Group>
        }
        columns={[
          {
            key: 'when',
            header: m.audit_col_when(),
            width: 190,
            render: (row) => (
              <Text size="sm" c="dimmed">
                {asI18n(formatOccurredAt(row.occurredAt))}
              </Text>
            ),
          },
          {
            key: 'action',
            header: m.audit_col_action(),
            width: 300,
            render: (row) => (
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                  {asI18n(row.type)}
                </Text>
                {/* Never squeezed: a badge reading "Reco…" says less than no
                    badge at all, so the action name gives way instead. */}
                <Badge
                  size="xs"
                  variant="light"
                  color="gray"
                  style={{ flexShrink: 0 }}
                >
                  {row.source === 'explicit'
                    ? m.audit_source_explicit()
                    : m.audit_source_auto()}
                </Badge>
              </Group>
            ),
          },
          {
            key: 'user',
            header: m.audit_col_user(),
            width: 220,
            render: (row) => {
              const identity = auditIdentity(row.userIdentity, users)
              if (identity.kind === 'system') {
                return (
                  <Text size="sm" c="dimmed">
                    {m.audit_user_system()}
                  </Text>
                )
              }
              return (
                <Group gap={6} wrap="nowrap">
                  <Text
                    size="sm"
                    truncate
                    style={{ minWidth: 0 }}
                    c={identity.kind === 'anonymous' ? 'dimmed' : undefined}
                    ff={identity.kind === 'anonymous' ? 'monospace' : undefined}
                  >
                    {asI18n(identity.label)}
                  </Text>
                  {identity.kind === 'anonymous' && (
                    <Badge
                      size="xs"
                      variant="light"
                      color="gray"
                      style={{ flexShrink: 0 }}
                    >
                      {m.audit_user_anonymous()}
                    </Badge>
                  )}
                  {identity.kind === 'user' && identity.actor && (
                    <Badge
                      size="xs"
                      variant="light"
                      color="grape"
                      style={{ flexShrink: 0 }}
                    >
                      {m.audit_user_actor()}
                    </Badge>
                  )}
                </Group>
              )
            },
          },
          {
            key: 'outcome',
            header: m.audit_col_outcome(),
            width: 120,
            render: (row) =>
              row.outcome ? (
                <Badge
                  size="sm"
                  variant="light"
                  color={OUTCOME_COLOUR[row.outcome] ?? 'gray'}
                >
                  {asI18n(row.outcome)}
                </Badge>
              ) : null,
          },
          {
            key: 'details',
            header: m.audit_col_details(),
            maxWidth: 320,
            render: (row) => (
              <Text size="xs" c="dimmed" truncate>
                {asI18n(summariseMetadata(row.metadata))}
              </Text>
            ),
          },
        ]}
      />

      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={m.audit_detail_title()}
      >
        {selected && <AuditEventDetail event={selected} users={users} />}
      </Drawer>
    </>
  )
}
