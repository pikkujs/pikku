import React from 'react'
import { KeyRound } from 'lucide-react'
import { useSearchParams } from '../router'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { TabbedPageHeader } from '../components/layout/TabbedPageHeader'
import { SecretsTab } from '../components/tabs/SecretsTab'
import { VariablesTab } from '../components/tabs/VariablesTab'

const TABS = [
  { value: 'secrets', label: 'Secrets' },
  { value: 'variables', label: 'Variables' },
]

export const ConfigPage: React.FunctionComponent = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'secrets'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <TabbedPageHeader
            icon={KeyRound}
            category="Config"
            docsHref="https://pikku.dev/docs/core-features/secrets"
            tabs={TABS}
            activeTab={tab}
            onTabChange={handleTabChange}
          />
        }
        emptyPanelMessage="Select an item to view its details"
      >
        {tab === 'variables' ? <VariablesTab /> : <SecretsTab />}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
