import React from 'react'
import { Group, Text, Tabs, Tooltip, ActionIcon, Box } from '@mantine/core'
import { ExternalLink } from 'lucide-react'
import classes from '../ui/console.module.css'

interface Tab {
  value: string
  label: string
}

interface TabbedPageHeaderProps {
  icon: React.ComponentType<{ size?: number }>
  category: string
  docsHref: string
  tabs: Tab[]
  activeTab: string
  onTabChange: (value: string) => void
  rightSection?: React.ReactNode
}

export const TabbedPageHeader: React.FunctionComponent<
  TabbedPageHeaderProps
> = ({ icon: Icon, category, docsHref, tabs, activeTab, onTabChange, rightSection }) => {
  return (
    <Group
      gap="xs"
      px="md"
      h={50}
      className={classes.noShrink}
      style={{
        zIndex: 9999,
        borderBottom: '1px solid var(--mantine-color-default-border)',
        backgroundColor: 'var(--mantine-color-body)',
      }}
    >
      <Tabs
        value={activeTab}
        onChange={(v) => v && onTabChange(v)}
        style={{ alignSelf: 'stretch' }}
        styles={{
          root: { display: 'flex', alignItems: 'stretch' },
          list: {
            borderBottom: 'none',
            background: 'transparent',
            padding: 0,
            gap: 0,
          },
        }}
      >
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Group ml="auto" gap="sm">
        {rightSection}
        <Tooltip label={`${category} docs`}>
          <ActionIcon
            component="a"
            href={docsHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            color="gray"
            size="sm"
          >
            <ExternalLink size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}
