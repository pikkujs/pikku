import React, { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Box, Center, Text } from '@mantine/core'
import { Terminal } from 'lucide-react'
import type { CLIMeta } from '@pikku/core/cli'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { CliCommandTree } from '@/components/cli/CliCommandTree'
import { CliHelpView } from '@/components/cli/CliHelpView'

export const CliPageClient: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const programId = searchParams.get('id') || ''
  const { meta } = usePikkuMeta()

  const [commandPath, setCommandPath] = useState<string[]>([])

  const program = useMemo(
    () => (meta.cliMeta || []).find((p: any) => p.wireId === programId),
    [meta.cliMeta, programId]
  )

  const allPrograms = useMemo(
    () =>
      (meta.cliMeta || []).map((p: any) => ({
        name: p.wireId,
        description: p.description,
      })),
    [meta.cliMeta]
  )

  const cliMeta = useMemo((): CLIMeta => {
    if (!program) return { programs: {}, renderers: {} }
    return {
      programs: {
        [programId]: {
          program: program.program || programId,
          commands: program.commands,
          options: program.options,
          defaultRenderName: program.defaultRenderName,
        },
      },
      renderers: meta.cliRenderers || {},
    }
  }, [program, programId, meta.cliRenderers])

  const handleNavigate = useCallback((path: string[]) => {
    setCommandPath(path)
  }, [])

  const handleProgramSwitch = useCallback(
    (name: string) => {
      setCommandPath([])
      navigate(`/apis/cli?id=${encodeURIComponent(name)}`)
    },
    [navigate]
  )

  if (!program) {
    return (
      <Center h="100vh">
        <Text c="dimmed">CLI program &ldquo;{programId}&rdquo; not found.</Text>
      </Center>
    )
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Terminal}
            category="CLI"
            categoryPath="/apis/cli"
            currentItem={programId}
            items={allPrograms}
            onItemSelect={handleProgramSwitch}
            docsHref="https://pikkujs.com/docs/cli"
          />
        }
        hidePanel
      >
        <Box style={{ display: 'flex', height: '100%' }}>
          <Box
            style={{
              width: 260,
              minWidth: 200,
              borderRight: '1px solid var(--mantine-color-default-border)',
              height: '100%',
            }}
          >
            <CliCommandTree
              program={program}
              activePath={commandPath}
              onSelect={handleNavigate}
            />
          </Box>
          <Box style={{ flex: 1, overflow: 'hidden' }}>
            <CliHelpView
              programId={programId}
              cliMeta={cliMeta}
              cliRenderers={meta.cliRenderers || {}}
              commandPath={commandPath}
              onNavigate={handleNavigate}
            />
          </Box>
        </Box>
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
