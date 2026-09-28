import React from 'react'
import { Terminal } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { CliProgramCards } from './CliProgramCards'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export interface CliListPanelProps {
  /** Filters the commands; the screen above owns the search box. */
  searchQuery?: string
  emptyHero?: React.ReactNode
}

/**
 * Every CLI program in the project as a card listing the commands it offers.
 * Mount anywhere under a `ConsoleSurface` — it reads its own meta.
 */
export const CliListPanel: React.FC<CliListPanelProps> = ({
  searchQuery = '',
  emptyHero,
}) => {
  const { meta } = usePikkuMeta()
  useLocale()
  const programs = meta.cliMeta || []

  if (programs.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Terminal}
        hero={emptyHero}
        title={m.wires_cli_empty_title()}
        description={m.wires_cli_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/cli"
      />
    )
  }

  return (
    <CliProgramCards
      programs={programs}
      cliRenderers={meta.cliRenderers || {}}
      searchQuery={searchQuery}
    />
  )
}
