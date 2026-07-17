import { Badge, Group, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Shield } from 'lucide-react'
import { TableListPage } from '../layout/TableListPage'
import { toScopeTreeRows } from './scope-tree'
import { useDeclaredScopes } from '../../hooks/useScopes'

const DOCS_HREF = 'https://pikku.dev/docs/authentication/scopes'

/**
 * Read-only view of the scope vocabulary declared in code via wireScope. A row
 * flagged stale is still stored but no longer declared — it grants nothing and
 * is what `pikku scopes prune` removes.
 */
export const ScopesVocabularyTab: React.FC = () => {
  const declaredQuery = useDeclaredScopes()
  const rows = toScopeTreeRows(declaredQuery.data?.scopes ?? [])

  return (
    <TableListPage
      icon={Shield}
      title={asI18n('Scopes')}
      docsHref={DOCS_HREF}
      data={rows}
      getKey={(row) => row.id}
      onRowClick={() => {}}
      loading={declaredQuery.isLoading}
      searchPlaceholder={asI18n('Search scopes…')}
      searchFilter={(row, q) =>
        row.id.toLowerCase().includes(q) ||
        (row.description ?? '').toLowerCase().includes(q)
      }
      emptyTitle={asI18n('No scopes declared')}
      emptyDescription={asI18n(
        'Declare scopes in code with wireScope, then run pikku all.'
      )}
      columns={[
        {
          key: 'id',
          header: asI18n('Scope'),
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
          header: asI18n('Description'),
          render: (row) => (
            <Text size="sm" c="dimmed">
              {asI18n(row.description || '—')}
            </Text>
          ),
        },
        {
          key: 'state',
          header: asI18n('State'),
          align: 'right',
          width: 120,
          render: (row) =>
            row.declared ? (
              <Group justify="flex-end" gap={6}>
                <Badge variant="dot" color="green" size="sm">
                  {asI18n('declared')}
                </Badge>
              </Group>
            ) : (
              <Badge variant="light" color="orange" size="sm">
                {asI18n('stale')}
              </Badge>
            ),
        },
      ]}
    />
  )
}
