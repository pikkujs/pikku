import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { asI18n } from '@pikku/react'
import { FolderGit2, TriangleAlert } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import {
  ChangeDetailCards,
  FileDetailCards,
  baseName,
  parentOf,
} from '../components/code/CodeCards'
import { CodeSavePanel } from '../components/code/CodeSavePanel'
import {
  errorText,
  isNotARepo,
  useGitDiff,
  useGitStatus,
  useProjectFile,
} from '../hooks/useProjectCode'
import { useSearchParams } from '../router'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { CodeOverview, codeSelection, type CodeView } from './CodeOverview'

const CODE_DOCS_HREF = 'https://pikku.dev/docs'

const VIEWS: CodeView[] = ['files', 'changes', 'history']

const isLocalOnly = (error: unknown) =>
  /local development/i.test(errorText(error))

export interface CodePageProps {
  headerRight?: React.ReactNode
}

export const CodePage: React.FC<CodePageProps> = ({ headerRight }) => {
  useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawView = searchParams.get('view') as CodeView | null
  const view: CodeView = rawView && VIEWS.includes(rawView) ? rawView : 'files'
  const file = searchParams.get('file') || undefined
  const dir = searchParams.get('dir') ?? (file ? parentOf(file) : '')

  const status = useGitStatus()
  const change = status.data?.files.find((entry) => entry.path === file)
  const showFile = view === 'files' && !!file
  const showChange = view === 'changes' && !!change
  const fileQuery = useProjectFile(showFile ? file : undefined)
  const diff = useGitDiff(showChange ? file : undefined)

  const go = (params: Record<string, string>) => setSearchParams(params)
  const onView = (next: CodeView) =>
    go(next === 'files' ? (dir ? { dir } : {}) : { view: next })
  const openFile = (path: string) => go({ dir: parentOf(path), file: path })
  const openChange = (path: string) => go({ view: 'changes', file: path })

  if (status.isLoading) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={<ListPageHeader title={m.code_page_title()} />}
        >
          <ConsoleLoading />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  if (status.error && isLocalOnly(status.error)) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={<ListPageHeader title={m.code_page_title()} />}
        >
          <EmptyStatePlaceholder
            icon={FolderGit2}
            title={m.code_unavailable_title()}
            description={m.code_unavailable_description()}
            docsHref={CODE_DOCS_HREF}
          />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  const blocked = status.error ? (
    isNotARepo(status.error) ? (
      <EmptyStatePlaceholder
        icon={FolderGit2}
        title={m.code_not_repo_title()}
        description={m.code_not_repo_description()}
        code="git init"
        docsHref={CODE_DOCS_HREF}
      />
    ) : (
      <EmptyStatePlaceholder
        icon={TriangleAlert}
        title={m.code_error_title()}
        description={m.code_error_description()}
        docsHref={CODE_DOCS_HREF}
      />
    )
  ) : undefined

  if (!showFile && !showChange) {
    return (
      <ConsoleSurface>
        <CodeOverview
          view={view}
          dir={dir}
          status={status.data}
          blocked={blocked}
          onView={onView}
          onOpenDir={(next) => go(next ? { dir: next } : {})}
          onOpenFile={openFile}
          onOpenChange={openChange}
          headerRight={headerRight}
        />
      </ConsoleSurface>
    )
  }

  const path = file!
  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        hidePanel
        surface="cards"
        sidePanel={
          showChange && status.data ? (
            <CodeSavePanel files={status.data.files} />
          ) : undefined
        }
        sidePanelWidth={320}
        sidePanelLabel={m.code_save_panel()}
        header={
          <ListPageHeader
            title={m.code_page_title()}
            item={asI18n(baseName(path))}
            onTitle={() => onView(view)}
            selection={codeSelection(view, status.data, onView)}
            filters={headerRight}
          />
        }
      >
        <CardsPage>
          {showChange && change ? (
            <ChangeDetailCards
              change={change}
              diff={diff.data}
              loading={diff.isLoading}
              error={diff.error}
              onOpenFile={() => openFile(path)}
            />
          ) : (
            <FileDetailCards
              path={path}
              file={fileQuery.data}
              loading={fileQuery.isLoading}
              error={fileQuery.error}
              change={change}
              onSeeChanges={() => openChange(path)}
            />
          )}
        </CardsPage>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
