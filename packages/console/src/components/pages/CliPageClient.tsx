import React, { useState, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate } from '../../router'
import { Box, Center, Text, Group, UnstyledButton } from '@mantine/core'
import { Terminal } from 'lucide-react'
import type { CLIMeta } from '@pikku/core/cli'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { PanelProvider } from '../../context/PanelContext'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { DetailPageHeader } from '../layout/DetailPageHeader'
import { CliCommandTree } from '../cli/CliCommandTree'
import { CliHelpView } from '../cli/CliHelpView'

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

  const commandBreadcrumb = useMemo(() => {
    if (commandPath.length === 0) return null
    return (
      <Group gap={4}>
        {commandPath.map((part, i) => (
          <React.Fragment key={i}>
            <Text size="md" c="dimmed">/</Text>
            <UnstyledButton onClick={() => handleNavigate(commandPath.slice(0, i + 1))}>
              <Text size="md" fw={i === commandPath.length - 1 ? 500 : 400} c={i === commandPath.length - 1 ? undefined : 'dimmed'}>
                {part}
              </Text>
            </UnstyledButton>
          </React.Fragment>
        ))}
      </Group>
    )
  }, [commandPath, handleNavigate])

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
            categoryPath="/apis?tab=cli"
            currentItem={programId}
            docsHref="https://pikku.dev/docs/wiring/cli"
            subtitle={commandBreadcrumb}
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
