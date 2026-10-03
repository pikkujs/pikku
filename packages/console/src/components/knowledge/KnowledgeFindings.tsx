import React from 'react'
import { Badge, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { CheckCircle2 } from 'lucide-react'
import { SEVERITY_ORDER, type KnowledgeFinding } from '../../lib/knowledge'
import { CardRow } from '../ui/CardRow'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { StatusTile } from '../ui/StatusTile'
import type { StatusTone } from '../ui/StatusBadge'
import { KnowledgeBackButton } from './KnowledgeBackButton'
import { KnowledgeSeverityIcon } from './KnowledgeSeverityIcon'

type KnowledgeFindingsProps = {
  findings: KnowledgeFinding[]
  /** Paths that are notes, so only those findings offer to open one. */
  notePaths: Set<string>
  onOpenNote: (path: string) => void
  onBack: () => void
}

const SEVERITY_TONE: Record<KnowledgeFinding['severity'], StatusTone> = {
  error: 'bad',
  warn: 'warn',
  info: 'info',
}

/**
 * What `pikku knowledge validate` reports, read rather than enforced. The console
 * shows the same findings the CLI gate would fail on, each with the fix hint, so
 * the place you notice a problem is the place that says what to do about it.
 */
export const KnowledgeFindings: React.FC<KnowledgeFindingsProps> = ({
  findings,
  notePaths,
  onOpenNote,
  onBack,
}) => {
  if (findings.length === 0) {
    return (
      <CardsPage>
        <KnowledgeBackButton onBack={onBack} />
        <SectionCard
          hero
          title={m.knowledge_findings_title()}
          blurb={m.knowledge_findings_none()}
          right={<CheckCircle2 size={24} color="var(--mantine-color-teal-5)" />}
        />
      </CardsPage>
    )
  }

  const sorted = [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.path.localeCompare(b.path)
  )

  return (
    <CardsPage>
      <KnowledgeBackButton onBack={onBack} />
      <SectionCard
        testId="knowledge-findings"
        hero
        title={
          findings.length === 1
            ? m.knowledge_findings_hero_one()
            : m.knowledge_findings_hero({ count: findings.length })
        }
        blurb={m.knowledge_findings_description()}
      >
        <Stack gap="sm" mt="lg">
          {sorted.map((finding) => {
            const isNote = notePaths.has(finding.path)
            return (
              <CardRow
                key={`${finding.id}:${finding.path}`}
                testId={`knowledge-finding-${finding.id}`}
                onClick={isNote ? () => onOpenNote(finding.path) : undefined}
                leading={
                  <StatusTile tone={SEVERITY_TONE[finding.severity]}>
                    <KnowledgeSeverityIcon
                      severity={finding.severity}
                      size={18}
                    />
                  </StatusTile>
                }
                title={asI18n(finding.message)}
                badges={
                  <Badge variant="light" radius="sm" tt="none" color="gray">
                    {asI18n(finding.id)}
                  </Badge>
                }
                meta={
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      {asI18n(finding.fixHint)}
                    </Text>
                    <Text
                      size="xs"
                      ff="monospace"
                      c={isNote ? 'blue' : 'dimmed'}
                    >
                      {asI18n(finding.path)}
                    </Text>
                  </Stack>
                }
              />
            )
          })}
        </Stack>
      </SectionCard>
    </CardsPage>
  )
}
