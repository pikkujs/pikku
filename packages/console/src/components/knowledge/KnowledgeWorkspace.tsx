import React, { useMemo, useState } from 'react'
import { Box, Center, Loader, Text } from '@pikku/mantine/core'
import { BookOpen } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { KnowledgeFindings } from './KnowledgeFindings'
import { KnowledgeNoteDocument } from './KnowledgeNoteDocument'
import { KnowledgeNoteNavigator } from './KnowledgeNoteNavigator'
import { useKnowledge } from '../../hooks/useKnowledge'
import {
  findingsForNote,
  groupNotesBySection,
  noteMatches,
  type KnowledgeSelection,
} from '../../lib/knowledge'
import classes from '../ui/console.module.css'

const DOCS_HREF = 'https://pikku.dev/docs/core-features/knowledge'

/**
 * The knowledge reading surface: the notes grouped by the question their section
 * answers, the selected one rendered as the document it is, and what
 * `pikku knowledge validate` has to say about the base as a whole.
 */
export const KnowledgeWorkspace: React.FC = () => {
  useLocale()
  const { bundle, isLoading } = useKnowledge()
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<KnowledgeSelection | null>(null)

  const notes = bundle?.notes ?? []
  const findings = bundle?.findings ?? []

  const matching = useMemo(
    () => notes.filter((note) => noteMatches(note, search)),
    [notes, search]
  )
  const groups = useMemo(
    () =>
      groupNotesBySection({
        notes: matching,
        sections: bundle?.sections ?? [],
      }),
    [matching, bundle?.sections]
  )
  const byPath = useMemo(
    () => new Map(notes.map((note) => [note.path, note])),
    [notes]
  )
  const titleFor = (path: string): string | undefined => byPath.get(path)?.title

  // A search that hides the selected note leaves the selection alone — it is
  // still what the reader is reading, and narrowing the list is not deselecting.
  const selected =
    selection ??
    (matching[0] ? { kind: 'note' as const, path: matching[0].path } : null)
  const selectedNote =
    selected?.kind === 'note' ? byPath.get(selected.path) : undefined

  const header = (
    <ListPageHeader
      title={m.knowledge_title()}
      description={
        bundle
          ? m.knowledge_stats({
              notes: bundle.stats.notes,
              links: bundle.stats.links,
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
        <Center style={{ flex: 1 }}>
          <Loader />
        </Center>
      </ResizablePanelLayout>
    )
  }

  if (notes.length === 0) {
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
      leftDrawer={
        <Box className={classes.listSurfaceCard} style={{ height: '100%' }}>
          <KnowledgeNoteNavigator
            groups={groups}
            findings={findings}
            selected={selected}
            onSelect={setSelection}
          />
        </Box>
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
