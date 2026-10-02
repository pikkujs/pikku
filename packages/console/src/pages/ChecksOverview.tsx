import React, { useEffect } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import {
  ChecksOverviewCards,
  groupProblems,
} from '../components/checks/ChecksCards'
import { CheckProblemPanel } from '../components/checks/CheckProblemPanel'
import { useOptionalPageOptions } from '../context/PageOptionsProvider'
import { usePhone } from '../lib/breakpoints'
import type { CheckResult } from '../hooks/useChecks'

export type ChecksOverviewProps = {
  result: CheckResult | null
  running: boolean
  error: unknown
  action: React.ReactNode
  selectedKey: string | null
  onSelect: (key: string | null) => void
}

export const ChecksOverview: React.FC<ChecksOverviewProps> = ({
  result,
  running,
  error,
  action,
  selectedKey,
  onSelect,
}) => {
  useLocale()
  const selected =
    groupProblems(result?.findings ?? []).find((p) => p.key === selectedKey) ??
    null

  const phone = usePhone()
  const openSheet = useOptionalPageOptions()?.setOpen
  useEffect(() => {
    if (!phone || !selected || !openSheet) return
    const frame = requestAnimationFrame(() => openSheet(true))
    return () => cancelAnimationFrame(frame)
  }, [phone, selected?.key, openSheet])

  return (
    <ResizablePanelLayout
      hidePanel
      surface="cards"
      sidePanel={
        selected ? (
          <CheckProblemPanel
            problem={selected}
            onClose={() => onSelect(null)}
          />
        ) : undefined
      }
      sidePanelWidth={380}
      sidePanelLabel={m.checks_panel_label()}
      header={<ListPageHeader title={m.checks_page_title()} lead={action} />}
    >
      <CardsPage>
        <ChecksOverviewCards
          result={result}
          running={running}
          error={error}
          selectedKey={selected?.key ?? null}
          onOpen={onSelect}
        />
      </CardsPage>
    </ResizablePanelLayout>
  )
}
