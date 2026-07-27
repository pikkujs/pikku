import React from 'react'
import { TabbedSurface } from '../components/console/TabbedSurface'
import type { TabbedSurfaceTab } from '../components/console/TabbedSurface'
import { SchedulersTab } from '../components/tabs/SchedulersTab'
import { QueuesTab } from '../components/tabs/QueuesTab'
import { TriggersTab } from '../components/tabs/TriggersTab'
import { m, mKey } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

interface JobsPageProps {
  queuesHero?: React.ReactNode
  triggersHero?: React.ReactNode
  schedulersHero?: React.ReactNode
}

export const JobsPage: React.FC<JobsPageProps> = ({
  queuesHero,
  triggersHero,
  schedulersHero,
}) => {
  useLocale()

  const tabs: TabbedSurfaceTab[] = [
    {
      value: 'schedulers',
      label: 'Schedulers',
      searchPlaceholder: mKey('jobs.search.schedulers'),
      render: (searchQuery) => (
        <SchedulersTab searchQuery={searchQuery} emptyHero={schedulersHero} />
      ),
    },
    {
      value: 'queues',
      label: 'Queues',
      searchPlaceholder: mKey('jobs.search.queues'),
      render: (searchQuery) => (
        <QueuesTab searchQuery={searchQuery} emptyHero={queuesHero} />
      ),
    },
    {
      value: 'triggers',
      label: 'Triggers',
      searchPlaceholder: mKey('jobs.search.triggers'),
      render: (searchQuery) => (
        <TriggersTab searchQuery={searchQuery} emptyHero={triggersHero} />
      ),
    },
  ]

  return (
    <TabbedSurface
      tabs={tabs}
      title={m.jobs_title()}
      description={m.jobs_description()}
      docsHref="https://pikku.dev/docs/wiring/scheduled-tasks"
      emptyPanelMessage={m.common_select_item()}
    />
  )
}
