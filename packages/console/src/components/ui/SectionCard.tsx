import React from 'react'
import { Card, Group, Stack, Text, Title } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'

export type SectionCardProps = {
  eyebrow?: React.ReactNode
  title: I18nNode
  subtitle?: I18nNode
  badges?: React.ReactNode
  blurb?: I18nNode
  right?: React.ReactNode
  help?: string
  testId?: string
  fill?: boolean
  hero?: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}

/** One section of a card-based screen: a heading, a plain sentence on what it is for, and its content. */
export const SectionCard: React.FC<SectionCardProps> = ({
  eyebrow,
  title,
  subtitle,
  badges,
  blurb,
  right,
  help,
  testId,
  fill = false,
  hero = false,
  children,
  footer,
}) => (
  <Card
    component="section"
    data-help={help}
    data-testid={testId}
    style={
      fill
        ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
        : undefined
    }
  >
    <Group justify="space-between" align="flex-start" gap="md">
      <Stack gap={4} miw={0} style={{ flex: '1 1 280px' }}>
        {eyebrow}
        <Group gap={10} align="baseline">
          <Title order={hero ? 1 : 2}>{title}</Title>
          {badges}
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
        </Group>
        {blurb && (
          <Text size={hero ? 'md' : 'sm'} c={hero ? undefined : 'dimmed'} maw={720}>
            {blurb}
          </Text>
        )}
      </Stack>
      {right}
    </Group>
    {children}
    {footer}
  </Card>
)
