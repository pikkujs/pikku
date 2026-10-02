import React from 'react'
import { Button, Loader } from '@pikku/mantine/core'
import { RefreshCw, Stethoscope } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { useChecks, useRunChecks } from '../hooks/useChecks'
import { useSearchParams } from '../router'
import { ChecksOverview } from './ChecksOverview'

const CHECKS_DOCS_HREF = 'https://pikku.dev/docs'

/** Whether the app is healthy: the last check run, what it found, and a way to run it again. */
export const ChecksPage: React.FC<{ hero?: React.ReactNode }> = ({ hero }) => {
  useLocale()
  const checks = useChecks()
  const runChecks = useRunChecks()
  const [searchParams, setSearchParams] = useSearchParams()

  const result = checks.data?.result ?? null
  const running = runChecks.isPending || !!checks.data?.running
  const error = runChecks.error ?? checks.error

  const action = (
    <Button
      type="button"
      size="xs"
      data-testid="checks-run"
      leftSection={running ? <Loader size={12} /> : <RefreshCw size={14} />}
      onClick={() => runChecks.mutate()}
      disabled={running}
    >
      {running
        ? m.checks_checking()
        : result
          ? m.checks_check_again()
          : m.checks_check_now()}
    </Button>
  )

  if (checks.isLoading) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={<ListPageHeader title={m.checks_page_title()} />}
        >
          <ConsoleLoading />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  if (!result && !running && !error) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={
            <ListPageHeader title={m.checks_page_title()} lead={action} />
          }
        >
          <EmptyStatePlaceholder
            icon={Stethoscope}
            hero={hero}
            title={m.checks_never_title()}
            description={m.checks_never_description()}
            code="pikku verify"
            docsHref={CHECKS_DOCS_HREF}
          />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  return (
    <ConsoleSurface>
      <ChecksOverview
        result={result}
        running={running}
        error={error}
        action={action}
        selectedKey={searchParams.get('problem')}
        onSelect={(key) => setSearchParams(key ? { problem: key } : {})}
      />
    </ConsoleSurface>
  )
}
