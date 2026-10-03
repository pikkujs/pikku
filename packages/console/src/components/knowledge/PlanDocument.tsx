import React from 'react'
import { Box, Progress, Stack, Text } from '@pikku/mantine/core'
import { appColorVars } from '@pikku/mantine/theme'
import { ListChecks, PenLine } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { planChecklistProgress, type MilestonePlan } from '../../lib/plan'
import { SectionHeader } from '../ui/SectionHeader'
import { SectionsCard } from '../ui/SectionsCard'
import { PlanChecklistRow } from './PlanChecklistRow'
import { planSections } from './plan-sections'

export type PlanDocumentProps = {
  milestone: MilestonePlan
  /** Rendered on the end of the progress band — a build timer, a cost, a link. */
  right?: React.ReactNode
}

/**
 * One milestone's technical plan, and what the generated meta can account for.
 *
 * Presentational on purpose: the plan and its checklist arrive as props, so the
 * same document renders from the console's knowledge bundle and from a host that
 * reaches a running project some other way. Neither can quietly show a different
 * plan from the one the reconcile was run against, because both come from one read.
 *
 * A milestone with no plan renders the reason rather than an empty document —
 * "nobody wrote one" and "one is there and will not parse" want different words in
 * front of a person, and `unavailable` already carries which it is.
 */
export const PlanDocument: React.FC<PlanDocumentProps> = ({
  milestone,
  right,
}) => {
  const { plan, checklist, complete, unavailable } = milestone

  if (!plan) {
    return (
      <Text size="xs" c="dimmed" data-testid="knowledge-plan-unavailable">
        {unavailable ? asI18n(unavailable) : m.knowledge_plan_none()}
      </Text>
    )
  }

  const progress = planChecklistProgress(checklist)

  return (
    <Stack gap="xl" data-testid="knowledge-plan">
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
        {asI18n(plan.description)}
      </Text>

      {progress.total > 0 && (
        <Box>
          <SectionHeader
            icon={ListChecks}
            iconColor={appColorVars.green}
            title={m.knowledge_plan_section_progress()}
            count={progress.total}
            right={
              right ?? (
                <Text size="xs" c="dimmed">
                  {progress.deferred > 0
                    ? m.knowledge_plan_progress_summary_deferred({
                        done: progress.done,
                        deferred: progress.deferred,
                      })
                    : m.knowledge_plan_progress_summary({
                        done: progress.done,
                      })}
                </Text>
              )
            }
          />
          <Stack gap={10}>
            <Progress
              value={(progress.done / progress.total) * 100}
              size="sm"
              color={complete ? 'green' : 'blue'}
            />
            <Stack gap={6}>
              {checklist.map((item) => (
                <PlanChecklistRow key={item.id} item={item} />
              ))}
            </Stack>
          </Stack>
        </Box>
      )}

      <SectionsCard
        icon={PenLine}
        iconColor={appColorVars.blue}
        title={m.knowledge_plan_sections_title()}
        count={null}
        right={
          <Text size="xs" c="dimmed">
            {m.knowledge_plan_sections_subtitle()}
          </Text>
        }
        sections={planSections(plan, checklist)}
        defaultOpen={['model', 'functions']}
      />
    </Stack>
  )
}
