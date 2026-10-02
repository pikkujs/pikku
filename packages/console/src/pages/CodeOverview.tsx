import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import {
  ChangesOverviewCards,
  FilesOverviewCards,
  HistoryCards,
  type SyncResult,
} from '../components/code/CodeCards'
import { CodeSavePanel } from '../components/code/CodeSavePanel'
import {
  useGitLog,
  useProjectFiles,
  usePullChanges,
  usePushChanges,
  type GitStatus,
} from '../hooks/useProjectCode'

export type CodeView = 'files' | 'changes' | 'history'

/** The header switch between the page's three views, with the change count on Changes. */
export const codeSelection = (
  view: CodeView,
  status: GitStatus | undefined,
  onChange: (view: CodeView) => void
) => ({
  ariaLabel: m.code_view_aria(),
  value: view,
  onChange,
  options: [
    { value: 'files' as const, label: m.code_view_files() },
    {
      value: 'changes' as const,
      label: status?.files.length
        ? m.code_view_changes_count({ count: status.files.length })
        : m.code_view_changes(),
    },
    { value: 'history' as const, label: m.code_view_history() },
  ],
})

export type CodeOverviewProps = {
  view: CodeView
  dir: string
  status: GitStatus | undefined
  onView: (view: CodeView) => void
  onOpenDir: (dir: string) => void
  onOpenFile: (path: string) => void
  onOpenChange: (path: string) => void
  headerRight?: React.ReactNode
  blocked?: React.ReactNode
}

export const CodeOverview: React.FC<CodeOverviewProps> = ({
  view,
  dir,
  status,
  onView,
  onOpenDir,
  onOpenFile,
  onOpenChange,
  headerRight,
  blocked,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')
  const files = useProjectFiles(dir, view === 'files')
  const log = useGitLog(view === 'history' && !blocked)
  const pull = usePullChanges()
  const push = usePushChanges()
  const [sync, setSync] = useState<SyncResult>()

  const onPull = () =>
    pull.mutate(undefined, {
      onSuccess: (result) => setSync({ kind: 'pull', result }),
      onError: (error) => setSync({ kind: 'failed', error }),
    })
  const onPush = () =>
    push.mutate(undefined, {
      onSuccess: (result) => setSync({ kind: 'push', result }),
      onError: (error) => setSync({ kind: 'failed', error }),
    })

  const openDir = (next: string) => {
    setSearchQuery('')
    onOpenDir(next)
  }

  const showSave = view === 'changes' && !blocked && !!status?.files.length

  return (
    <ResizablePanelLayout
      hidePanel
      surface="cards"
      sidePanel={showSave ? <CodeSavePanel files={status!.files} /> : undefined}
      sidePanelWidth={320}
      sidePanelLabel={m.code_save_panel()}
      header={
        <ListPageHeader
          title={m.code_page_title()}
          selection={codeSelection(view, status, onView)}
          search={
            view === 'files'
              ? {
                  placeholder: m.code_search_folder(),
                  value: searchQuery,
                  onChange: setSearchQuery,
                  width: 220,
                }
              : undefined
          }
          filters={headerRight}
        />
      }
    >
      {view !== 'files' && blocked ? (
        blocked
      ) : (
        <CardsPage>
          {view === 'files' && (
            <FilesOverviewCards
              dir={dir}
              entries={files.data?.entries}
              loading={files.isLoading}
              error={files.error}
              status={status}
              searchQuery={searchQuery}
              onOpenDir={openDir}
              onOpenFile={onOpenFile}
              onSeeChanges={() => onView('changes')}
            />
          )}
          {view === 'changes' && status && (
            <ChangesOverviewCards
              status={status}
              sync={sync}
              pulling={pull.isPending}
              pushing={push.isPending}
              onPull={onPull}
              onPush={onPush}
              onOpenChange={onOpenChange}
            />
          )}
          {view === 'history' && (
            <HistoryCards
              commits={log.data?.commits}
              loading={log.isLoading}
              error={log.error}
            />
          )}
        </CardsPage>
      )}
    </ResizablePanelLayout>
  )
}
