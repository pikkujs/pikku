import React from 'react'
import { Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import type { PlanSlot } from '@/lib/plan'

type PlanSlotBodyProps<T> = {
  slot: PlanSlot<T>
  render: (item: T, index: number) => React.ReactNode
}

/**
 * A section's prose followed by its items.
 *
 * The description renders for an `n/a` slot too — that sentence is the whole
 * content of a slot nobody built, and dropping it would leave a section that says
 * nothing where the plan said why.
 */
export const PlanSlotBody = <T,>({ slot, render }: PlanSlotBodyProps<T>) => {
  return (
    <Stack gap={10}>
      <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
        {asI18n(slot.description)}
      </Text>
      {slot.kind === 'built' && (
        <Stack gap={10}>{slot.items.map(render)}</Stack>
      )}
    </Stack>
  )
}
