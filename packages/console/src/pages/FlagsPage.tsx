import { useState } from 'react'
import { Alert } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { FlagBoard } from '../components/flags/FlagBoard'
import { CardsPage } from '../components/ui/CardsPage'
import type { FlagBoardRow } from '../components/flags/flag-lanes'
import {
  useFeatureFlags,
  usePruneFlags,
  useSyncFlags,
} from '../hooks/useFeatureFlags'
import { useSearchParams } from '../router'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'

export const FlagsPage: React.FC = () => {
  useLocale()
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedName = searchParams.get('flag')

  const writable = useFeatureFlags().data?.writable ?? false
  const syncFlags = useSyncFlags()
  const pruneFlags = usePruneFlags()

  const openFlag = (flag: FlagBoardRow) => setSearchParams({ flag: flag.name })

  const syncError = syncFlags.error as Error | null
  const pruneError = pruneFlags.error as Error | null

  return (
    <PageContainer
      surface="cards"
      header={
        <ListPageHeader
          title={m.flags_page_title()}
          description={m.flags_page_desc()}
          docsHref="https://pikku.dev/docs/console/features#feature-flags"
          actions={[
            {
              key: 'sync',
              label: m.flags_sync(),
              icon: <RefreshCw size={14} />,
              loading: syncFlags.isPending,
              disabled: !writable,
              tooltip: writable ? undefined : m.flags_read_only_body(),
              onClick: () => syncFlags.mutate(),
              helpAnchor: 'flags-sync',
              testId: 'flags-sync',
            },
            {
              key: 'prune',
              label: m.flags_prune(),
              icon: <Trash2 size={14} />,
              loading: pruneFlags.isPending,
              disabled: !writable,
              tooltip: writable ? undefined : m.flags_read_only_body(),
              onClick: () => pruneFlags.mutate(),
              helpAnchor: 'flags-prune',
              testId: 'flags-prune',
            },
          ]}
          search={{
            placeholder: m.flags_search(),
            value: search,
            onChange: setSearch,
            width: 240,
            helpAnchor: 'search',
          }}
        />
      }
    >
      <CardsPage>
        {(syncFlags.data || syncError) && (
          <Alert
            color={syncError ? 'red' : 'teal'}
            styles={{ message: { overflowWrap: 'anywhere' } }}
            withCloseButton
            onClose={() => syncFlags.reset()}
            title={syncError ? m.flags_sync_error() : undefined}
            data-testid="flags-sync-result"
          >
            {syncError
              ? asI18n(syncError.message)
              : syncFlags.data!.synced === 0
                ? m.flags_synced_none()
                : plural(
                    syncFlags.data!.synced,
                    m.flags_synced_one,
                    m.flags_synced
                  )}
          </Alert>
        )}

        {(pruneFlags.data || pruneError) && (
          <Alert
            color={pruneError ? 'red' : 'teal'}
            styles={{ message: { overflowWrap: 'anywhere' } }}
            withCloseButton
            onClose={() => pruneFlags.reset()}
            title={pruneError ? m.flags_prune_error() : undefined}
            data-testid="flags-prune-result"
          >
            {pruneError
              ? asI18n(pruneError.message)
              : pruneFlags.data!.pruned.length === 0
                ? m.flags_pruned_none()
                : plural(
                    pruneFlags.data!.pruned.length,
                    m.flags_pruned_one,
                    m.flags_pruned
                  )}
          </Alert>
        )}

        <FlagBoard
          search={search}
          selectedName={selectedName}
          panelOpen={selectedName !== null}
          onOpenFlag={openFlag}
          onClosePanel={() => setSearchParams({})}
        />
      </CardsPage>
    </PageContainer>
  )
}
