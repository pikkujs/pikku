import React from 'react'
import { Terminal } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { CliProgramExplorer } from './CliProgramExplorer'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export interface CliListPanelProps {
  /** Filters the command tree; the screen above owns the search box. */
  searchQuery?: string
  emptyHero?: React.ReactNode
}

/**
 * Every CLI program in the project as a command tree beside its rendered help.
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
        title={m.cli_empty_title()}
        description={m.cli_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/cli"
      />
    )
  }

  return (
    <CliProgramExplorer
      programs={programs}
      cliRenderers={meta.cliRenderers || {}}
      searchQuery={searchQuery}
    />
  )
}
