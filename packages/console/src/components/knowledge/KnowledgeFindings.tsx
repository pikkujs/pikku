import React from 'react'
import { Anchor, Badge, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { CheckCircle2 } from 'lucide-react'
import { SEVERITY_ORDER, type KnowledgeFinding } from '../../lib/knowledge'
import { KnowledgeSeverityIcon } from './KnowledgeSeverityIcon'

type KnowledgeFindingsProps = {
  findings: KnowledgeFinding[]
  /** Paths that are notes, so only those findings offer to open one. */
  notePaths: Set<string>
  onOpenNote: (path: string) => void
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
}) => {
  if (findings.length === 0) {
    return (
      <Box style={{ maxWidth: 860, padding: '28px 32px 64px' }}>
        <Group gap={8}>
          <CheckCircle2 size={16} color="var(--mantine-color-teal-5)" />
          <Text size="sm">{m.knowledge_findings_none()}</Text>
        </Group>
      </Box>
    )
  }

  const sorted = [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.path.localeCompare(b.path)
  )

  return (
    <Box
      data-testid="knowledge-findings"
      style={{ maxWidth: 860, padding: '28px 32px 64px' }}
    >
      <Stack gap="lg">
        <Stack gap={8}>
          <Text fw={700} size="xl" style={{ lineHeight: 1.25 }}>
            {m.knowledge_findings_title()}
          </Text>
          <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
            {m.knowledge_findings_description()}
          </Text>
        </Stack>

        <Stack gap="md">
          {sorted.map((finding) => (
            <Stack gap={4} key={finding.id}>
              <Group gap={8} wrap="nowrap" align="center">
                <KnowledgeSeverityIcon severity={finding.severity} />
                {notePaths.has(finding.path) ? (
                  <Anchor
                    component="button"
                    type="button"
                    size="xs"
                    ff="monospace"
                    onClick={() => onOpenNote(finding.path)}
                  >
                    {asI18n(finding.path)}
                  </Anchor>
                ) : (
                  <Text size="xs" c="dimmed" ff="monospace">
                    {asI18n(finding.path)}
                  </Text>
                )}
                <Badge size="xs" variant="light" radius="sm" tt="none">
                  {asI18n(finding.id)}
                </Badge>
              </Group>
              <Text size="sm">{asI18n(finding.message)}</Text>
              <Text size="xs" c="dimmed">
                {asI18n(finding.fixHint)}
              </Text>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}
