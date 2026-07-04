import React from 'react'
import { Stack, Skeleton } from '@pikku/mantine/core'
import { Route } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { FlowCard } from './FlowCard'
import type { FlowEntry } from './flow-types'

type FlowsListProps = {
  flows: FlowEntry[]
  onOpen: (name: string) => void
  loading?: boolean
}

export const FlowsList: React.FC<FlowsListProps> = ({
  flows,
  onOpen,
  loading = false,
}) => {
  useLocale()

  if (loading) {
    return (
      <Stack gap={12} p="md">
        <Skeleton height={84} radius={14} />
        <Skeleton height={84} radius={14} />
      </Stack>
    )
  }

  if (flows.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Route}
        title={m.scenarios_empty_title()}
        description={m.scenarios_empty_description()}
        docsHref="https://pikku.dev/docs/wiring/workflows"
      />
    )
  }

  return (
    <Stack gap={12}>
      {flows.map((flow) => (
        <FlowCard key={flow.name} flow={flow} onOpen={onOpen} />
      ))}
    </Stack>
  )
}
