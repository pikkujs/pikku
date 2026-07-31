import { useMemo, useState } from 'react'
import { useKnowledge } from './useKnowledge'
import {
  entryPointNote,
  groupNotesBySection,
  noteMatches,
  type KnowledgeSelection,
} from '../lib/knowledge'

type KnowledgeBundle = NonNullable<ReturnType<typeof useKnowledge>['bundle']>
type KnowledgeNote = KnowledgeBundle['notes'][number]
type KnowledgeFinding = KnowledgeBundle['findings'][number]
type KnowledgeGroups = ReturnType<typeof groupNotesBySection>

export interface KnowledgeBrowse {
  /** Notes surviving the search, grouped by the question their section answers
   *  — what the rail lists. */
  groups: KnowledgeGroups
  findings: KnowledgeFinding[]
  search: string
  setSearch: (search: string) => void
  /** What the reader picked, or the entry-point note when they have picked
   *  nothing yet. */
  selected: KnowledgeSelection | null
  setSelected: (selection: KnowledgeSelection) => void
  selectedNote: KnowledgeNote | undefined
  /** Every note by path, for resolving link titles in the document. */
  byPath: Map<string, KnowledgeNote>
  stats: KnowledgeBundle['stats'] | undefined
  noteCount: number
  isLoading: boolean
}

/**
 * The browse state `KnowledgeWorkspace` normally keeps to itself — the search
 * text and which note is being read, plus the grouped list they produce. Hoist
 * it here and the note rail can be mounted as its own surface (a host's side
 * panel, a phone sheet) with `KnowledgeBrowseRail`, then handed back to
 * `KnowledgePage` via its `browse` prop so both drive one state.
 *
 * Mounting the rail apart costs no extra request: `useKnowledge` is keyed query
 * state, so the second caller reads the first one's cache.
 */
export const useKnowledgeBrowse = (): KnowledgeBrowse => {
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

  // A search that hides the selected note leaves the selection alone — it is
  // still what the reader is reading, and narrowing the list is not deselecting.
  const fallback = entryPointNote(matching)
  const selected =
    selection ??
    (fallback ? { kind: 'note' as const, path: fallback.path } : null)
  const selectedNote =
    selected?.kind === 'note' ? byPath.get(selected.path) : undefined

  return {
    groups,
    findings,
    search,
    setSearch,
    selected,
    setSelected: setSelection,
    selectedNote,
    byPath,
    stats: bundle?.stats,
    noteCount: notes.length,
    isLoading,
  }
}
