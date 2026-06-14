import React from 'react'
import { SegmentedControl } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { PageHeader, PageHeaderControls } from './PageLayout'

interface Tab {
  value: string
  label: string
}

interface TabbedPageHeaderProps {
  icon: React.ComponentType<{ size?: number }>
  category: string
  docsHref: string
  subtitle?: I18nNode
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
      title={asI18n(category)}
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
