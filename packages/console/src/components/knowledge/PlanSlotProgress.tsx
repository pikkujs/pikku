import React from 'react'
import { Text } from '@pikku/mantine/core'
import { Check } from 'lucide-react'
import { m } from '@/i18n/messages'

type PlanSlotProgressProps = { done: number; total: number }

/** How much of one section the generated meta can account for. */
export const PlanSlotProgress: React.FC<PlanSlotProgressProps> = ({
  done,
  total,
}) => {
  if (total === 0) return null
  if (done === total) {
    return <Check size={13} style={{ color: 'var(--app-green)' }} />
  }
  return (
    <Text fz={11} ff="monospace" style={{ color: 'var(--app-amber)' }}>
      {m.knowledge_plan_progress_count({ done, total })}
    </Text>
  )
}
