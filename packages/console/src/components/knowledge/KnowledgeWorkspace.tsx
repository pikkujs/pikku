import React from 'react'
import { Box, Center, Text } from '@pikku/mantine/core'
import { BookOpen } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { KnowledgeFindings } from './KnowledgeFindings'
import { KnowledgeNoteDocument } from './KnowledgeNoteDocument'
import { KnowledgeNoteNavigator } from './KnowledgeNoteNavigator'
import { useKnowledgeBrowse } from '../../hooks/useKnowledgeBrowse'
import type { KnowledgeBrowse } from '../../hooks/useKnowledgeBrowse'
import { findingsForNote } from '../../lib/knowledge'
import { usePageOptionsDismiss } from '../../context/PageOptionsProvider'
import classes from '../ui/console.module.css'
import { ConsoleLoading } from '../ui/ConsoleLoading'

const DOCS_HREF = 'https://pikku.dev/docs/core-features/knowledge'

/**
 * The knowledge reading surface: the notes grouped by the question their section
 * answers, the selected one rendered as the document it is, and what
 * `pikku knowledge validate` has to say about the base as a whole.
 */
export interface KnowledgeWorkspaceProps {
  /** Browse state owned by the host (see `useKnowledgeBrowse`). Supplying it
   *  means the host mounts the note rail itself, so this drops its own. */
  browse?: KnowledgeBrowse
}

export const KnowledgeWorkspace: React.FC<KnowledgeWorkspaceProps> = ({
  browse: hostBrowse,
}) => {
  useLocale()
  // Always mounted so the hook order never depends on the prop; the host's
  // state wins when there is one, and the two share one query cache.
  const ownBrowse = useKnowledgeBrowse()
  const browse = hostBrowse ?? ownBrowse
  const dismiss = usePageOptionsDismiss()
  const {
    groups,
    findings,
    search,
    setSearch,
    selected,
    setSelected: setSelection,
    selectedNote,
    byPath,
    stats,
    plans,
    noteCount,
    isLoading,
  } = browse

  const titleFor = (path: string): string | undefined => byPath.get(path)?.title

  const header = (
    <ListPageHeader
      title={m.knowledge_title()}
      description={
        stats
          ? m.knowledge_stats({
              notes: stats.notes,
              links: stats.links,
            })
          : undefined
      }
      docsHref={DOCS_HREF}
      search={{
        placeholder: m.knowledge_search_placeholder(),
        value: search,
        onChange: setSearch,
      }}
    />
  )

  if (isLoading) {
    return (
      <ResizablePanelLayout header={header} hidePanel>
        <ConsoleLoading />
      </ResizablePanelLayout>
    )
  }

  if (noteCount === 0) {
    return (
      <ResizablePanelLayout header={header} hidePanel>
        <EmptyStatePlaceholder
          icon={BookOpen}
          title={m.knowledge_empty_title()}
          description={m.knowledge_empty_description()}
          docsHref={DOCS_HREF}
        />
      </ResizablePanelLayout>
    )
  }

  return (
    <ResizablePanelLayout
      header={header}
      hidePanel
      leftDrawerLabel={m.pane_notes()}
      leftDrawer={
        hostBrowse ? null : (
          <Box className={classes.listSurfaceCard} style={{ height: '100%' }}>
            <KnowledgeNoteNavigator
              groups={groups}
              findings={findings}
              selected={selected}
              onSelect={(selection) => {
                setSelection(selection)
                dismiss()
              }}
            />
          </Box>
        )
      }
    >
      {selected?.kind === 'findings' ? (
        <KnowledgeFindings
          findings={findings}
          notePaths={new Set(byPath.keys())}
          onOpenNote={(path) => setSelection({ kind: 'note', path })}
        />
      ) : selectedNote ? (
        <KnowledgeNoteDocument
          note={selectedNote}
          findings={findingsForNote(findings, selectedNote.path)}
          titleFor={titleFor}
          onOpenNote={(path) => setSelection({ kind: 'note', path })}
          plan={plans[selectedNote.path]}
        />
      ) : (
        <Center p="xl">
          <Text size="sm" c="dimmed">
            {m.knowledge_no_matches()}
          </Text>
        </Center>
      )}
    </ResizablePanelLayout>
  )
}
