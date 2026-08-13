import React, { Suspense, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { Group, TextInput, Center, Loader } from '@pikku/mantine/core'
import { GitBranch, Search } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useSearchParams } from '../router'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { WorkflowListPanel } from '../components/workflow/WorkflowListPanel'
import {
  OSSConsoleNavigator,
  ConsoleNavigatorCtx,
  useConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

export type { WorkflowExtraColumn } from '../components/project/WorkflowsList'

const WorkflowPageInner: React.FC<{
  onOpen?: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  immersiveDetail?: boolean
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = ({
  onOpen,
  headerRight,
  emptyHero,
  metricSlot,
  immersiveDetail = false,
  icon = GitBranch,
}) => {
  useLocale()
  const { workflowId, navigateTo } = useConsoleNavigator()
  // Seeded from `?search=` so one workflow is linkable from elsewhere — a
  // knowledge note naming `workflow:onboarding` opens this list on it. Initial
  // value only; from then on the box belongs to the reader.
  const [searchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('search') ?? ''
  )

  if (!onOpen && workflowId) {
    return <WorkflowTabContent immersiveDetail={immersiveDetail} />
  }

  const handleOpen = (name: string) => {
    if (onOpen) {
      onOpen(name)
    } else {
      navigateTo('workflows', name)
    }
  }

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title={m.workflows_title()}
            description={m.workflows_description()}
            docsHref="https://pikku.dev/docs/wiring/workflows"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder={m.workflows_search_placeholder()}
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
                {headerRight}
              </Group>
            }
          />
        }
      >
        <WorkflowListPanel
          onOpen={handleOpen}
          searchQuery={searchQuery}
          icon={icon}
          emptyHero={emptyHero}
          metricSlot={metricSlot}
        />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}

export const WorkflowsPage: React.FC<{
  onOpen?: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
  immersiveDetail?: boolean
  extraColumns?: unknown[]
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
}> = ({
  onOpen,
  headerRight,
  emptyHero,
  metricSlot,
  immersiveDetail = false,
  extraColumns,
  icon = GitBranch,
}) => {
  const existingNavigator = useContext(ConsoleNavigatorCtx)
  const inner = (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <WorkflowPageInner
        onOpen={onOpen}
        headerRight={headerRight}
        emptyHero={emptyHero}
        metricSlot={metricSlot}
        immersiveDetail={immersiveDetail}
        icon={icon}
      />
    </Suspense>
  )
  if (existingNavigator) return inner
  return <OSSConsoleNavigator>{inner}</OSSConsoleNavigator>
}
