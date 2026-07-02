import React from 'react'
import { Accordion, Anchor, Badge, Box, Group, Paper, Stack, Text } from '@pikku/mantine/core'
import { Package, ShieldCheck, ExternalLink } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { SecurityAuditIssue } from '../../hooks/useSecurityAudit'
import { classifyAdvisory } from './security-classify'
import {
  SEV_COLOR,
  SEV_LABEL,
  CAT_LABEL,
  CAT_WHY,
  type RenderRemediation,
} from './security-view-utils'

export interface FindingItemProps {
  issue: SecurityAuditIssue
  latest?: string
  // Stable, unique Accordion.Item value (advisoryId can be empty).
  itemValue: string
  renderRemediation: RenderRemediation
}

export const FindingItem: React.FC<FindingItemProps> = ({
  issue,
  latest,
  itemValue,
  renderRemediation,
}) => {
  const cat = classifyAdvisory(issue.title)
  const sev = issue.severity
  const fixed = issue.recommendedVersion ?? latest
  const target = latest ?? issue.recommendedVersion

  return (
    <Accordion.Item value={itemValue}>
      {/* Control + row actions as siblings: the actions live outside the
          Accordion.Control button so clicking them doesn't toggle the row. */}
      <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }} pr="sm">
        <Accordion.Control style={{ flex: 1, minWidth: 0 }}>
          <Group gap="sm" wrap="nowrap" align="center">
            <Badge color={SEV_COLOR[sev]} variant="light" size="sm">
              {SEV_LABEL[sev]()}
            </Badge>
            <Text
              span
              size="sm"
              fw={600}
              ff="monospace"
              style={{ flexShrink: 0 }}
            >
              {asI18n(issue.package)}
            </Text>
            <Text
              span
              size="sm"
              c="dimmed"
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {asI18n(issue.title)}
            </Text>
          </Group>
        </Accordion.Control>
        <Group gap="sm" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          {issue.url && (
            <Anchor
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              size="xs"
            >
              <Group gap={4} align="center" wrap="nowrap">
                <ExternalLink size={12} />
                {m.security_view_advisory()}
              </Group>
            </Anchor>
          )}
          {target &&
            renderRemediation({ pkg: issue.package, version: target, issue })}
        </Group>
      </Box>
      <Accordion.Panel>
        <Stack gap="md" px="md" pb="md" pt="xs">
          <Group gap="xs" wrap="wrap">
            <Badge variant="default" size="sm" leftSection={<Package size={11} />}>
              {m.security_detected_by({ tool: 'bun' })}
            </Badge>
            {issue.cwe.map((c) => (
              <Badge key={c} variant="default" size="sm" ff="monospace">
                {asI18n(c)}
              </Badge>
            ))}
            <Badge color={SEV_COLOR[sev]} variant="light" size="sm">
              {CAT_LABEL[cat]()}
            </Badge>
            {issue.cvssScore != null && (
              <Badge color={SEV_COLOR[sev]} variant="light" size="sm" ff="monospace">
                {m.security_cvss({ score: issue.cvssScore })}
              </Badge>
            )}
          </Group>

          <Box style={{ maxWidth: 760 }}>
            <Text span size="sm" fw={600}>
              {m.security_why_matters()}
            </Text>{' '}
            <Text span size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
              {CAT_WHY[cat]()}
            </Text>
          </Box>

          {fixed && (
            <Paper
              withBorder
              radius="md"
              p="sm"
              style={{
                borderColor: 'var(--mantine-color-green-4)',
                background: 'var(--mantine-color-green-light)',
              }}
            >
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ShieldCheck
                  size={17}
                  color="var(--mantine-color-green-7)"
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                  {m.security_fixed_summary({
                    package: issue.package,
                    fixed,
                    current: issue.vulnerableVersions,
                    latest: target ?? fixed,
                  })}
                </Text>
              </Group>
            </Paper>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  )
}
