import React from 'react'
import { Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'

/**
 * A slot the plan deliberately left empty.
 *
 * Every slot is either built or `n/a` with a sentence saying why, so an empty
 * section is a decision a reader can hold the plan to rather than an omission.
 */
export const PlanNotApplicable: React.FC = () => {
  return (
    <Text fz={11} c="dimmed">
      {m.knowledge_plan_not_applicable()}
    </Text>
  )
}
