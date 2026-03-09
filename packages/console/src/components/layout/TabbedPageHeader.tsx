import React from 'react'
import { Group, Text, SegmentedControl, Tooltip, ActionIcon } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

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
      style={{
        zIndex: 9999,
        borderBottom: '1px solid var(--mantine-color-default-border)',
        backgroundColor: 'var(--mantine-color-body)',
        flexShrink: 0,
      }}
    >
      <Icon size={16} />
      <Text size="md" fw={500}>
        {category}
      </Text>

      <SegmentedControl
        size="xs"
        data={tabs}
        value={activeTab}
        onChange={onTabChange}
        ml="md"
      />

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
