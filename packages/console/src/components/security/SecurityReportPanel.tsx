import React from 'react'
import { Box, ScrollArea, Stack, Text } from '@pikku/mantine/core'
import { PackageCheck, ShieldAlert } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevCode } from '../ui/DevDetail'
import { SecurityAuditView, type SecurityLens } from './SecurityAuditView'
import type { RenderUpgradeAction } from './security-view-utils'
import { useSecurityAudit } from '../../hooks/useSecurityAudit'
import { ConsoleLoading } from '../ui/ConsoleLoading'

export interface SecurityReportPanelProps {
  lens: SecurityLens
  query: string
  emptyHero?: React.ReactNode
  /**
   * Whether the last audit run failed. Owned by whoever renders the run
   * button, since the mutation state lives with it.
   */
  runError?: boolean
  /** Passed through to {@link SecurityAuditView}; see its own prop. */
  renderUpgradeAction?: RenderUpgradeAction
}

/**
 * The security audit report body — findings or dependencies, depending on the
 * lens. Mountable on its own; the run button and lens control live wherever a
 * host puts them.
 */
export const SecurityReportPanel: React.FC<SecurityReportPanelProps> = ({
  lens,
  query,
  emptyHero,
  runError = false,
  renderUpgradeAction,
}) => {
  useLocale()
  const { report, isLoading } = useSecurityAudit()

  if (isLoading) {
    return <ConsoleLoading />
  }

  if (!report) {
    if (emptyHero) return <>{emptyHero}</>
    return (
      <ScrollArea style={{ flex: 1 }}>
        <CardsPage maw={880}>
          <SectionCard
            hero
            testId="security-hero"
            eyebrow={
              <Box mb={4}>
                <StatusBadge tone={runError ? 'bad' : 'neutral'}>
                  {runError
                    ? m.security_hero_failed_badge()
                    : m.security_hero_never_badge()}
                </StatusBadge>
              </Box>
            }
            title={m.security_hero_never_title()}
            blurb={
              runError
                ? m.security_empty_error_description()
                : m.security_hero_never_blurb()
            }
          />
          <SectionCard
            testId="security-what"
            title={m.security_what_title()}
            blurb={m.security_what_blurb()}
          >
            <Stack gap="xs" mt="md">
              <CardRow
                leading={
                  <StatusTile tone="neutral">
                    <ShieldAlert size={18} />
                  </StatusTile>
                }
                title={m.security_what_weak_title()}
                meta={m.security_what_weak_about()}
              />
              <CardRow
                leading={
                  <StatusTile tone="neutral">
                    <PackageCheck size={18} />
                  </StatusTile>
                }
                title={m.security_what_outdated_title()}
                meta={m.security_what_outdated_about()}
              />
            </Stack>
          </SectionCard>
          <ForDevelopers testId="security-developers">
            <DevCode
              label={m.security_dev_run()}
              code="pikku audit --outdated"
            />
          </ForDevelopers>
        </CardsPage>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea style={{ flex: 1 }}>
      <Box p="lg">
        {runError && (
          <Text c="red" mb="sm" data-testid="security-run-error">
            {m.security_run_error()}
          </Text>
        )}
        <SecurityAuditView
          report={report}
          lens={lens}
          query={query}
          renderUpgradeAction={renderUpgradeAction}
        />
      </Box>
    </ScrollArea>
  )
}
