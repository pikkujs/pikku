import React from 'react'
import { SegmentedControl } from '@mantine/core'
import { PageHeader, PageHeaderControls } from './PageLayout'

interface Tab {
  value: string
  label: string
}

interface TabbedPageHeaderProps {
  icon: React.ComponentType<{ size?: number }>
  category: string
  docsHref: string
  subtitle?: React.ReactNode
  tabs: Tab[]
  activeTab: string
  onTabChange: (value: string) => void
  rightSection?: React.ReactNode
}

export const TabbedPageHeader: React.FC<TabbedPageHeaderProps> = ({
  icon: _Icon,
  category,
  docsHref,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  rightSection,
}) => {
  return (
    <PageHeader
      title={category}
      subtitle={subtitle}
      docsHref={docsHref}
      actions={
        <PageHeaderControls>
          <SegmentedControl size="xs" value={activeTab} onChange={onTabChange} data={tabs} />
          {rightSection}
        </PageHeaderControls>
      }
    />
  )
}
