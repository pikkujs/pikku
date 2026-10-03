import React from 'react'
import { Accordion, Box, Card, Group, Text } from '@pikku/mantine/core'
import { appColorVars } from '@pikku/mantine/theme'
import type { I18nString } from '@pikku/react'
import { SectionHeader } from './SectionHeader'

export type CardSection = {
  key: string
  title: I18nString
  icon: React.ComponentType<{ size?: number }>
  count: number
  right?: React.ReactNode
  body: React.ReactNode
}

export type SectionsCardProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>
  iconColor: string
  title: I18nString
  count?: number | null
  right?: React.ReactNode
  sections: CardSection[]
  defaultOpen?: string[]
}

// The accordion's own corners, inset by the card's border so the first and last
// control do not square off against the radius they sit inside.
const INNER = 'calc(var(--mantine-radius-md) - 1px)'

/**
 * A long document as one card of collapsed sections.
 *
 * Every section states its own count and may put a progress readout on its right,
 * so the shape of the whole is readable with all of it closed — which is the state
 * it opens in, apart from whatever the caller names in `defaultOpen`.
 */
export const SectionsCard: React.FC<SectionsCardProps> = ({
  icon,
  iconColor,
  title,
  count,
  right,
  sections,
  defaultOpen,
}) => {
  if (sections.length === 0) return null
  const total =
    count === undefined ? sections.reduce((n, s) => n + s.count, 0) : count

  return (
    <Box>
      <SectionHeader
        icon={icon}
        iconColor={iconColor}
        title={title}
        count={total}
        right={right}
      />
      <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
        <Accordion
          multiple
          chevronPosition="right"
          defaultValue={defaultOpen}
          chevronSize={14}
          styles={{
            control: { paddingBlock: 7, paddingInline: 12 },
            icon: {
              marginInlineEnd: 9,
              color: 'var(--app-text-dim)',
              display: 'flex',
            },
            content: { paddingInline: 12, paddingBottom: 12 },
          }}
        >
          {sections.map((section, index) => (
            <Accordion.Item key={section.key} value={section.key}>
              <Accordion.Control
                icon={<section.icon size={14} />}
                style={{
                  ...(index === 0
                    ? {
                        borderStartStartRadius: INNER,
                        borderStartEndRadius: INNER,
                      }
                    : {}),
                  ...(index === sections.length - 1
                    ? { borderEndStartRadius: INNER, borderEndEndRadius: INNER }
                    : {}),
                }}
              >
                <Group gap={8} wrap="nowrap" style={{ width: '100%' }}>
                  <Text fz={13} fw={600} style={{ color: appColorVars.text }}>
                    {section.title}
                  </Text>
                  <Text fz={11} c="dimmed" ff="monospace">
                    {section.count}
                  </Text>
                  {section.right && (
                    <Group gap={8} wrap="nowrap" style={{ marginLeft: 'auto' }}>
                      {section.right}
                    </Group>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>{section.body}</Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Card>
    </Box>
  )
}
