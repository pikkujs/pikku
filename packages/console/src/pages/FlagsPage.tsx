import { useState } from 'react'
import { Alert, Stack } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { FlagBoard } from '../components/flags/FlagBoard'
import type { FlagBoardRow } from '../components/flags/flag-lanes'
import { usePruneFlags, useSyncFlags } from '../hooks/useFeatureFlags'
import { useSearchParams } from '../router'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'
import { plural } from '@/i18n/plural'

export const FlagsPage: React.FC = () => {
  useLocale()
  const [search, setSearch] = useState('')
  // The open flag is a URL param rather than component state: "look at
  // quarterlyReports" is a thing one operator sends another, and a panel that
  // cannot be linked to is a screenshot.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedName = searchParams.get('flag')

  const syncFlags = useSyncFlags()
  const pruneFlags = usePruneFlags()

  const openFlag = (flag: FlagBoardRow) => setSearchParams({ flag: flag.name })

  const syncError = syncFlags.error as Error | null
  const pruneError = pruneFlags.error as Error | null

  return (
    <PageContainer
      noPadding
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
              onClick: () => syncFlags.mutate(),
              helpAnchor: 'flags-sync',
              testId: 'flags-sync',
            },
            {
              key: 'prune',
              label: m.flags_prune(),
              icon: <Trash2 size={14} />,
              loading: pruneFlags.isPending,
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
      <Stack gap={0}>
        {(syncFlags.data || syncError) && (
          <Alert
            color={syncError ? 'red' : 'teal'}
            m="md"
            mb={0}
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
            m="md"
            mb={0}
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
      </Stack>
    </PageContainer>
  )
}
