import React, { Suspense, useMemo, useState } from 'react'
import {
  Group,
  TextInput,
  Center,
  Loader,
  SegmentedControl,
} from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { FlowsList } from '../components/flows/FlowsList'
import type { FlowEntry } from '../components/flows/flow-types'
import { PersonasView } from '../components/personas/PersonasView'
import type { PersonaEntry } from '../components/personas/persona-types'
import { OSSConsoleNavigator, useConsoleNavigator } from '../context/ConsoleNavigatorContext'
import { toEnglishName } from '../lib/strings'

const USER_FLOWS_BASE_PATH = '/tests/userflows'

const UserFlowsPageInner: React.FC = () => {
  useLocale()
  const { workflowId, navigateTo } = useConsoleNavigator()
  const { meta, loading } = usePikkuMeta()
  const [view, setView] = useState<'user-flows' | 'personas'>('user-flows')
  const [searchQuery, setSearchQuery] = useState('')

  const flowEntries = useMemo((): FlowEntry[] => {
    const actors = meta.userFlowActors ?? {}
    return (Object.values(meta.workflows ?? {}) as any[])
      .filter((w) => w.source === 'user-flow' || w.userFlow === true)
      .map((w): FlowEntry => ({
        name: w.name,
        displayName: toEnglishName(w.name),
        description: w.description ?? w.summary,
        stepCount: w.nodes
          ? Object.keys(w.nodes).length
          : (w.steps?.length ?? 0),
        cast: (w.actors ?? []).map((key: string) => ({
          key,
          name: (actors as any)[key]?.name,
          jobTitle: (actors as any)[key]?.jobTitle,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.workflows, meta.userFlowActors])

  const personaEntries = useMemo((): PersonaEntry[] => {
    const actors = meta.userFlowActors ?? {}
    const flowsByActor = new Map<string, number>()
    for (const w of Object.values(meta.workflows ?? {}) as any[]) {
      for (const actor of w.actors ?? []) {
        flowsByActor.set(actor, (flowsByActor.get(actor) ?? 0) + 1)
      }
    }
    return Object.entries(actors)
      .map(([key, cfg]: [string, any]): PersonaEntry => ({
        key,
        name: cfg.name ?? key,
        email: cfg.email,
        jobTitle: cfg.jobTitle,
        personality: cfg.personality,
        flowCount: flowsByActor.get(key) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.userFlowActors, meta.workflows])

  const filteredFlows = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return flowEntries
    return flowEntries.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q)
    )
  }, [flowEntries, searchQuery])

  const filteredPersonas = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return personaEntries
    return personaEntries.filter(
      (p) =>
        p.key.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.personality?.toLowerCase().includes(q)
    )
  }, [personaEntries, searchQuery])

  if (workflowId) {
    return <WorkflowTabContent immersiveDetail />
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title={asI18n('User Flows')}
            description={asI18n(
              'End-to-end user-flow tests and the personas that run them'
            )}
            docsHref="https://pikku.dev/docs/wiring/workflows"
            filters={
              <Group gap="sm" wrap="nowrap">
                <SegmentedControl
                  size="xs"
                  value={view}
                  onChange={(value) => setView(value as typeof view)}
                  data={[
                    { label: asI18n('Flows'), value: 'user-flows' },
                    { label: asI18n('Personas'), value: 'personas' },
                  ]}
                />
                <TextInput
                  placeholder={
                    view === 'personas'
                      ? asI18n('Search personas…')
                      : asI18n('Search flows…')
                  }
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
              </Group>
            }
          />
        }
      >
        {view === 'personas' ? (
          <PersonasView personas={filteredPersonas} loading={loading} />
        ) : (
          <FlowsList
            flows={filteredFlows}
            onOpen={(name) => navigateTo('workflows', name)}
            loading={loading}
          />
        )}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}

export const UserFlowsPage: React.FC = () => (
  <OSSConsoleNavigator basePath={USER_FLOWS_BASE_PATH}>
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <UserFlowsPageInner />
    </Suspense>
  </OSSConsoleNavigator>
)
