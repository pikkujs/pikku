import React from 'react'
import { Box, Button, Text } from '@pikku/mantine/core'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type {
  KnowledgeBundle,
  KnowledgeFinding,
  KnowledgeGroup,
} from '../../lib/knowledge'
import { toNavSections } from '../../lib/knowledge'
import type { MilestonePlan } from '../../lib/plan'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { SummaryCard, type SummaryFact } from '../ui/SummaryCard'
import { KnowledgeSectionCard } from './KnowledgeSectionCard'

export type KnowledgeOverviewProps = {
  groups: KnowledgeGroup[]
  findings: KnowledgeFinding[]
  plans: Record<string, MilestonePlan>
  stats: KnowledgeBundle['stats'] | undefined
  searching: boolean
  onOpenNote: (path: string) => void
  onOpenFindings: () => void
}

export const KnowledgeOverview: React.FC<KnowledgeOverviewProps> = ({
  groups,
  findings,
  plans,
  stats,
  searching,
  onOpenNote,
  onOpenFindings,
}) => {
  const notes = groups.flatMap((group) => group.notes)
  const indexFor = (path: string | undefined) =>
    path ? notes.find((note) => note.path === path) : undefined
  const navSections = toNavSections(groups)
  const entry = indexFor(navSections.find((s) => s.section === '')?.indexPath)
  const heroOpensEntry = !searching && entry !== undefined
  const sections = navSections
    .map((section) =>
      heroOpensEntry && section.section === ''
        ? { ...section, indexPath: undefined }
        : section
    )
    .filter((section) => section.indexPath || section.notes.length > 0)
  const milestones = notes.filter((note) => note.type === 'milestone')
  const built = milestones.filter((note) => note.status === 'built').length

  const facts: SummaryFact[] = [
    {
      label: m.knowledge_fact_sections(),
      value: asI18n(String(stats?.sections ?? navSections.length)),
    },
    {
      label: m.knowledge_fact_links(),
      value: asI18n(String(stats?.links ?? 0)),
    },
    ...(milestones.length > 0
      ? [
          {
            label: m.knowledge_fact_milestones(),
            value: m.knowledge_fact_of({
              done: built,
              total: milestones.length,
            }),
          },
        ]
      : []),
    {
      label: m.knowledge_fact_issues(),
      value:
        findings.length === 0
          ? m.knowledge_fact_issues_none()
          : asI18n(String(findings.length)),
      tone: findings.length > 0 ? 'warn' : undefined,
    },
  ]

  return (
    <Box data-testid="knowledge-navigator">
      <CardsPage>
        {!searching && (
          <SummaryCard
            testId="knowledge-summary"
            title={
              entry
                ? notes.length === 1
                  ? m.knowledge_hero_title_one({ name: entry.title })
                  : m.knowledge_hero_title({
                      count: notes.length,
                      name: entry.title,
                    })
                : notes.length === 1
                  ? m.knowledge_hero_title_unnamed_one()
                  : m.knowledge_hero_title_unnamed({ count: notes.length })
            }
            blurb={
              entry?.description
                ? asI18n(entry.description)
                : m.knowledge_hero_body()
            }
            facts={facts}
            right={
              entry && (
                <Button
                  rightSection={<ArrowRight size={14} />}
                  data-testid="knowledge-start"
                  onClick={() => onOpenNote(entry.path)}
                >
                  {m.knowledge_hero_start()}
                </Button>
              )
            }
          />
        )}

        {findings.length > 0 && (
          <SectionCard
            testId="knowledge-issues"
            title={m.knowledge_findings_title()}
            subtitle={
              findings.length === 1
                ? m.knowledge_issue_count_one()
                : m.knowledge_issue_count({ count: findings.length })
            }
            blurb={m.knowledge_findings_description()}
            right={
              <Button
                variant="light"
                color="orange"
                size="compact-sm"
                leftSection={<TriangleAlert size={14} />}
                data-testid="knowledge-nav-findings"
                onClick={onOpenFindings}
              >
                {m.knowledge_issues_review()}
              </Button>
            }
          />
        )}

        {sections.length === 0 ? (
          <SectionCard title={m.knowledge_title()}>
            <Text size="sm" c="dimmed" mt="md">
              {m.knowledge_no_matches()}
            </Text>
          </SectionCard>
        ) : (
          sections.map((section) => (
            <KnowledgeSectionCard
              key={section.section || 'root'}
              section={section}
              index={indexFor(section.indexPath)}
              plans={plans}
              findings={findings}
              onOpen={onOpenNote}
            />
          ))
        )}
      </CardsPage>
    </Box>
  )
}
