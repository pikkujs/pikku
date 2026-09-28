import React from 'react'
import { Divider, SimpleGrid, Stack, Text } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { SectionCard } from './SectionCard'
import { STATUS_TONE_COLOR, type StatusTone } from './StatusBadge'

export type SummaryFact = {
  label: I18nNode
  value: I18nNode
  tone?: StatusTone
}

/** The card a screen opens with: what is true in one line, a sentence on why it matters, and the figures behind it. */
export const SummaryCard: React.FC<{
  title: I18nNode
  blurb?: I18nNode
  eyebrow?: React.ReactNode
  facts: SummaryFact[]
  testId?: string
}> = ({ title, blurb, eyebrow, facts, testId }) => (
  <SectionCard testId={testId} hero eyebrow={eyebrow} title={title} blurb={blurb}>
    <Divider my="md" />
    <SimpleGrid cols={{ base: 2, sm: facts.length }} spacing="lg">
      {facts.map((fact, index) => (
        <Stack key={index} gap={4}>
          <Text size="sm" c="dimmed">
            {fact.label}
          </Text>
          <Text
            size="sm"
            fw={500}
            c={
              fact.tone && fact.tone !== 'neutral'
                ? STATUS_TONE_COLOR[fact.tone]
                : undefined
            }
          >
            {fact.value}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  </SectionCard>
)
