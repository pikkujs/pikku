import React from 'react'
import { Box, ScrollArea, Text } from '@pikku/mantine/core'
import { ShieldCheck } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { SecurityAuditView, type SecurityLens } from './SecurityAuditView'
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
}) => {
  useLocale()
  const { report, isLoading } = useSecurityAudit()

  if (isLoading) {
    return <ConsoleLoading />
  }

  if (!report) {
    return (
      <EmptyStatePlaceholder
        icon={ShieldCheck}
        hero={emptyHero}
        title={m.security_empty_title()}
        description={
          runError
            ? m.security_empty_error_description()
            : m.security_empty_description()
        }
        docsHref="https://pikku.dev/docs"
      />
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
        <SecurityAuditView report={report} lens={lens} query={query} />
      </Box>
    </ScrollArea>
  )
}
