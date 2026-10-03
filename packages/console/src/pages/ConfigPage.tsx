import React from 'react'
import { TabbedSurface } from '../components/console/TabbedSurface'
import type { TabbedSurfaceTab } from '../components/console/TabbedSurface'
import { SecretsTab } from '../components/tabs/SecretsTab'
import { VariablesTab } from '../components/tabs/VariablesTab'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const TABS: TabbedSurfaceTab[] = [
  { value: 'secrets', label: 'Secrets', render: () => <SecretsTab /> },
  { value: 'variables', label: 'Variables', render: () => <VariablesTab /> },
]

export const ConfigPage: React.FC = () => {
  useLocale()
  return (
    <TabbedSurface
      controls="stacked"
      tabs={TABS}
      title={m.config_title()}
      description={m.config_description()}
      emptyPanelMessage={m.common_select_item()}
    />
  )
}
