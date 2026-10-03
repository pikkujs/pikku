import React, { useMemo, useState } from 'react'
import { createSpotlight, Spotlight, useSpotlight } from '@mantine/spotlight'
import type { SpotlightActionData } from '@mantine/spotlight'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { m } from '@/i18n/messages'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'

export const [filePickerStore, filePicker] = createSpotlight()

const BOUNDARY = new Set(['/', '-', '_', '.', ' '])

/** Best alignment of one term as a subsequence of the path: word starts, adjacent letters, file-name hits and unbroken substrings score most. */
function term(path: string, query: string): number | null {
  const p = path.toLowerCase()
  const q = query.toLowerCase()
  const nameStart = p.lastIndexOf('/') + 1
  const charScore = (j: number) =>
    (j === 0 || BOUNDARY.has(p[j - 1]!) ? 6 : 0) + (j >= nameStart ? 3 : 0)
  let prev: number[] = []
  for (let i = 0; i < q.length; i++) {
    const cur = new Array<number>(p.length).fill(-Infinity)
    let bestBefore = -Infinity
    for (let j = 0; j < p.length; j++) {
      if (i > 0 && j > 1) bestBefore = Math.max(bestBefore, prev[j - 2]!)
      if (p[j] !== q[i]) continue
      const from =
        i === 0
          ? 0
          : Math.max(bestBefore - 3, j > 0 ? prev[j - 1]! + 8 : -Infinity)
      if (from > -Infinity) cur[j] = from + charScore(j)
    }
    prev = cur
  }
  const best = Math.max(...prev)
  if (best === -Infinity) return null
  let whole = 0
  for (let at = p.indexOf(q); at !== -1; at = p.indexOf(q, at + 1))
    whole = Math.max(
      whole,
      q.length * 4 +
        (at === 0 || BOUNDARY.has(p[at - 1]!) ? 12 : 0) +
        (at >= nameStart ? 8 : 0)
    )
  return best + whole
}

/** Every space-separated term must match; null when one does not. */
function score(path: string, query: string): number | null {
  let total = 0
  for (const t of query.trim().split(/\s+/)) {
    const s = term(path, t)
    if (s === null) return null
    total += s
  }
  return total * 1000 - path.length
}

export const FilePicker: React.FC<{ onSelect: (path: string) => void }> = ({
  onSelect,
}) => {
  const rpc = usePikkuRPC()
  const { opened } = useSpotlight(filePickerStore)
  const [query, setQuery] = useState('')
  const { data } = useQuery({
    queryKey: ['project-file-paths'],
    queryFn: () => rpc.invoke('console:listProjectFilePaths', {}),
    enabled: opened,
    staleTime: 10_000,
  })

  const actions: SpotlightActionData[] = useMemo(() => {
    const paths = data?.paths ?? []
    const ranked = query.trim()
      ? paths
          .map((path) => ({ path, s: score(path, query) }))
          .filter((r): r is { path: string; s: number } => r.s !== null)
          .sort((a, b) => b.s - a.s)
          .map((r) => r.path)
      : paths
    return ranked.slice(0, 50).map((path) => {
      const slash = path.lastIndexOf('/')
      return {
        id: path,
        label: path.slice(slash + 1),
        description: slash > 0 ? path.slice(0, slash) : undefined,
        leftSection: <FileText size={16} />,
        onClick: () => onSelect(path),
      }
    })
  }, [data, query, onSelect])

  return (
    <Spotlight
      store={filePickerStore}
      shortcut="mod + P"
      actions={actions}
      filter={(_, a) => a}
      query={query}
      onQueryChange={setQuery}
      nothingFound={m.code_picker_nothing_found()}
      searchProps={{ placeholder: m.code_picker_placeholder() }}
      scrollable
      maxHeight={420}
      highlightQuery
    />
  )
}
