import React, { Suspense, useMemo } from 'react'
import { Text, Center, Loader, Group } from '@mantine/core'
import { Terminal } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { CliPageClient } from '@/components/pages/CliPageClient'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface CliProgramEntry {
  wireId: string
  description?: string
  commandCount: number
  hasGlobalOptions: boolean
  data: any
}

const countCommands = (commands: Record<string, any>): number => {
  let count = 0
  for (const cmd of Object.values(commands)) {
    if (cmd.pikkuFuncId) count++
    if (cmd.subcommands) count += countCommands(cmd.subcommands)
  }
  return count
}

const COLUMNS = [
  {
    key: 'name',
    header: 'NAME',
    render: (entry: CliProgramEntry) => (
      <Text fw={500} ff="monospace" truncate>
        {entry.wireId}
      </Text>
    ),
  },
  {
    key: 'description',
    header: 'DESCRIPTION',
    render: (entry: CliProgramEntry) => (
      <Text size="sm" c={entry.description ? undefined : 'dimmed'} truncate>
        {entry.description || '—'}
      </Text>
    ),
  },
  {
    key: 'commands',
    header: 'COMMANDS',
    render: (entry: CliProgramEntry) => (
      <Group gap={6}>
        <PikkuBadge
          type="dynamic"
          badge="functions"
          value={entry.commandCount}
        />
      </Group>
    ),
  },
]

const CliList: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()
  const navigate = useNavigate()

  const programs = useMemo((): CliProgramEntry[] => {
    return (meta.cliMeta || []).map((program: any) => ({
      wireId: program.wireId,
      description: program.description,
      commandCount: countCommands(program.commands || {}),
      hasGlobalOptions: Object.keys(program.options || {}).length > 0,
      data: program,
    }))
  }, [meta.cliMeta])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Terminal}
            category="CLI"
            docsHref="https://pikkujs.com/docs/cli"
          />
        }
        hidePanel
      >
        <TableListPage
          title="CLI"
          icon={Terminal}
          docsHref="https://pikkujs.com/docs/cli"
          data={programs}
          columns={COLUMNS}
          getKey={(entry) => entry.wireId}
          onRowClick={(entry) =>
            navigate(`/apis/cli?id=${encodeURIComponent(entry.wireId)}`)
          }
          searchPlaceholder="Search CLI programs..."
          searchFilter={(entry, q) =>
            entry.wireId.toLowerCase().includes(q) ||
            (entry.description?.toLowerCase().includes(q) ?? false)
          }
          emptyMessage="No CLI programs found."
          loading={loading}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

const CliPageInner: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams()
  const cliId = searchParams.get('id')

  if (cliId) {
    return <CliPageClient />
  }

  return <CliList />
}

export const CliPage: React.FunctionComponent = () => {
  return (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <CliPageInner />
    </Suspense>
  )
}
