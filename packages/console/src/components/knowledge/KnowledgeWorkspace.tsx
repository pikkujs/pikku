import React from 'react'
import { BookOpen } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { SectionCard } from '../ui/SectionCard'
import { KnowledgeFindings } from './KnowledgeFindings'
import { KnowledgeNoteDocument } from './KnowledgeNoteDocument'
import { KnowledgeNoteList } from './KnowledgeNoteList'
import { KnowledgeOverview } from './KnowledgeOverview'
import { knowledgeSectionTitle } from './knowledge-section-title'
import { useKnowledgeBrowse } from '../../hooks/useKnowledgeBrowse'
import type { KnowledgeBrowse } from '../../hooks/useKnowledgeBrowse'
import { findingsForNote, toNavSections } from '../../lib/knowledge'
import { ConsoleLoading } from '../ui/ConsoleLoading'

const DOCS_HREF = 'https://pikku.dev/docs/core-features/knowledge'

/**
 * The knowledge reading surface: the notes grouped by the question their section
 * answers, the selected one rendered as the document it is, and what
 * `pikku knowledge validate` has to say about the base as a whole.
 */
export interface KnowledgeWorkspaceProps {
  /** Browse state owned by the host (see `useKnowledgeBrowse`), so a note rail
   *  the host mounts itself drives the same selection as this page. */
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
  const openNote = (path: string) => setSelection({ kind: 'note', path })
  const backToBrowse = () => setSelection(null)

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
        onChange: (value) => {
          setSearch(value)
          if (selected) setSelection(null)
        },
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

  const renderNote = () => {
    if (!selectedNote) return null
    const section = toNavSections(groups).find(
      (candidate) => candidate.section === selectedNote.section
    )
    const sectionTitle = knowledgeSectionTitle(
      selectedNote.section,
      section?.indexPath ? byPath.get(section.indexPath) : undefined
    )
    const siblings = (
      groups.find((group) => group.section === selectedNote.section)?.notes ??
      []
    ).filter((note) => note.path !== selectedNote.path)

    return (
      <KnowledgeNoteDocument
        note={selectedNote}
        findings={findingsForNote(findings, selectedNote.path)}
        titleFor={titleFor}
        onOpenNote={openNote}
        plan={plans[selectedNote.path]}
        sectionTitle={sectionTitle}
        onBack={backToBrowse}
        related={
          siblings.length > 0 ? (
            <SectionCard
              testId="knowledge-note-related"
              title={m.knowledge_more_in({ section: sectionTitle })}
              subtitle={
                siblings.length === 1
                  ? m.knowledge_section_count_one()
                  : m.knowledge_section_count({ count: siblings.length })
              }
              blurb={m.knowledge_more_in_blurb()}
            >
              <KnowledgeNoteList
                notes={siblings}
                plans={plans}
                findings={findings}
                onOpen={openNote}
              />
            </SectionCard>
          ) : undefined
        }
      />
    )
  }

  return (
    <ResizablePanelLayout header={header} hidePanel surface="cards">
      {selected?.kind === 'findings' ? (
        <KnowledgeFindings
          findings={findings}
          notePaths={new Set(byPath.keys())}
          onOpenNote={openNote}
          onBack={backToBrowse}
        />
      ) : selectedNote ? (
        renderNote()
      ) : (
        <KnowledgeOverview
          groups={groups}
          findings={findings}
          plans={plans}
          stats={stats}
          searching={search.trim() !== ''}
          onOpenNote={openNote}
          onOpenFindings={() => setSelection({ kind: 'findings' })}
        />
      )}
    </ResizablePanelLayout>
  )
}
