import React, { useState } from 'react'
import { Button, Loader, Stack } from '@pikku/mantine/core'
import { Play } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SecurityReportPanel } from '../components/security/SecurityReportPanel'
import type { SecurityLens } from '../components/security/SecurityAuditView'
import { useSecurityAudit, useRunSecurityAudit } from '../hooks/useSecurityAudit'

export const SecurityPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()
  const { report } = useSecurityAudit()
  const runAudit = useRunSecurityAudit()
  const running = runAudit.isPending

  const [lens, setLens] = useState<SecurityLens>('issues')
  const [query, setQuery] = useState('')

  const hasContent =
    !!report && !report.note && report.issues.length + report.updates.length > 0

  const runButton = (
    <Button
      type="button"
      size="xs"
      data-testid="security-run-audit"
      leftSection={
        running ? <Loader size={12} color="white" /> : <Play size={14} />
      }
      onClick={() => runAudit.mutate()}
      disabled={running}
      loading={running}
    >
      {running ? m.security_running() : m.security_run_audit()}
    </Button>
  )

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <ListPageHeader
        title={m.security_title()}
        description={m.security_description()}
        docsHref="https://pikku.dev/docs"
        lead={runButton}
        search={
          hasContent
            ? {
                placeholder:
                  lens === 'issues'
                    ? m.security_search_issues()
                    : m.security_search_deps(),
                value: query,
                onChange: setQuery,
                width: 240,
              }
            : undefined
        }
        selection={
          hasContent
            ? {
                ariaLabel: m.security_lens_aria(),
                value: lens,
                onChange: setLens,
                options: [
                  { value: 'issues', label: m.security_lens_issues() },
                  {
                    value: 'dependencies',
                    label: m.security_lens_dependencies(),
                  },
                ],
              }
            : undefined
        }
      />

      <SecurityReportPanel
        lens={lens}
        query={query}
        emptyHero={emptyHero}
        runError={runAudit.isError}
      />
    </Stack>
  )
}
