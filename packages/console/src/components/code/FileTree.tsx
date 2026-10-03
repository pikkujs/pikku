import { useState, useCallback, useEffect } from 'react'
import { Box, Text, UnstyledButton, Loader, Center } from '@pikku/mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuRPC } from '../../context/PikkuRpcProvider'

export function FileTree({
  dirPath,
  depth,
  selectedPath,
  onSelect,
}: {
  dirPath: string
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  useLocale()
  const rpc = usePikkuRPC()
  const [expanded, setExpanded] = useState<Set<string>>(new Set([dirPath]))

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-files', dirPath],
    queryFn: () => rpc.invoke('console:listProjectFiles', { path: dirPath }),
    enabled: expanded.has(dirPath),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!selectedPath) return
    const ancestor = (data?.entries ?? []).find(
      (entry) => entry.type === 'directory' && selectedPath.startsWith(`${entry.path}/`)
    )
    if (!ancestor) return
    setExpanded((prev) => (prev.has(ancestor.path) ? prev : new Set(prev).add(ancestor.path)))
  }, [selectedPath, data])

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <Center py="xs">
        <Loader size="xs" />
      </Center>
    )
  }

  if (error) {
    return (
      <Text size="xs" c="red" pl={depth * 12 + 8}>
        {m.code_load_error()}
      </Text>
    )
  }

  return (
    <>
      {(data?.entries ?? []).map((entry) => {
        const isDir = entry.type === 'directory'
        const isOpen = expanded.has(entry.path)
        const isSelected = entry.path === selectedPath

        return (
          <Box key={entry.path}>
            <UnstyledButton
              data-testid={`code-entry-${entry.path}`}
              onClick={() => {
                if (isDir) toggle(entry.path)
                else onSelect(entry.path)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                paddingLeft: depth * 12 + 8,
                paddingTop: 3,
                paddingBottom: 3,
                paddingRight: 8,
                width: '100%',
                background: isSelected ? 'var(--mantine-primary-color-filled)' : 'transparent',
                borderRadius: 4,
                color: isSelected ? 'var(--mantine-primary-color-contrast)' : 'var(--mantine-color-text)',
              }}
            >
              {isDir ? (
                isOpen ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )
              ) : (
                <span style={{ width: 12 }} />
              )}
              {isDir ? (
                isOpen ? (
                  <FolderOpen size={14} />
                ) : (
                  <Folder size={14} />
                )
              ) : (
                <FileText size={14} />
              )}
              <Text
                size="xs"
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {asI18n(entry.name)}
              </Text>
            </UnstyledButton>
            {isDir && isOpen && (
              <FileTree
                dirPath={entry.path}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            )}
          </Box>
        )
      })}
    </>
  )
}
