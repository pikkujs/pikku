import { Alert, Badge, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Shield } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { toScopeTreeRows } from './scope-tree'
import { isForbiddenScopeError } from './scope-error'
import { useDeclaredScopes } from '../../hooks/useScopes'
import { m } from '@/i18n/messages'

const DOCS_HREF = 'https://pikku.dev/docs/authentication/scopes'

/**
 * Read-only view of the scope vocabulary declared in code via wireScope. A row
 * flagged stale is still stored but no longer declared — it grants nothing and
 * is what `pikku scopes prune` removes.
 */
export const ScopesVocabularyTab: React.FC = () => {
  const declaredQuery = useDeclaredScopes()
  const rows = toScopeTreeRows(declaredQuery.data?.scopes ?? [])

  if (declaredQuery.isError) {
    const error = declaredQuery.error
    if (isForbiddenScopeError(error)) {
      return (
        <Alert color="yellow" title={m.scopes_vocab_forbidden_title()}>
          {m.scopes_vocab_forbidden_body()}
        </Alert>
      )
    }
    return (
      <Alert color="red" title={m.scopes_vocab_load_error()}>
        {error instanceof Error ? asI18n(error.message) : null}
      </Alert>
    )
  }

  return (
    <TableListPage
      icon={Shield}
      title={m.scopes_vocab_title()}
      docsHref={DOCS_HREF}
      data={rows}
      getKey={(row) => row.id}
      onRowClick={() => {}}
      loading={declaredQuery.isLoading}
      searchPlaceholder={m.scopes_search_scopes()}
      searchFilter={(row, q) =>
        row.id.toLowerCase().includes(q) ||
        (row.description ?? '').toLowerCase().includes(q)
      }
      emptyTitle={m.scopes_no_declared_title()}
      emptyDescription={m.scopes_no_declared_description()}
      columns={[
        {
          key: 'id',
          header: m.scopes_col_scope(),
          render: (row) => (
            <Text
              size="sm"
              ff="monospace"
              fw={row.hasChildren ? 600 : 400}
              c={row.declared ? undefined : 'dimmed'}
            >
              {asI18n(row.id)}
            </Text>
          ),
        },
        {
          key: 'description',
          header: m.scopes_col_description(),
          render: (row) => (
            <Text size="sm" c="dimmed">
              {asI18n(row.description || '—')}
            </Text>
          ),
        },
        {
          key: 'state',
          header: m.scopes_col_state(),
          align: 'right',
          width: 120,
          render: (row) =>
            row.declared ? (
              <Group justify="flex-end" gap={6}>
                <Badge variant="dot" color="green" size="sm">
                  {m.scopes_state_declared()}
                </Badge>
              </Group>
            ) : (
              <Badge variant="light" color="orange" size="sm">
                {m.scopes_state_stale()}
              </Badge>
            ),
        },
      ]}
    />
  )
}
