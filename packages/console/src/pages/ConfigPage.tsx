import React from 'react'
import { useSearchParams } from '../router'
import { Stack, SegmentedControl } from '@mantine/core'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SecretsTab } from '../components/tabs/SecretsTab'
import { VariablesTab } from '../components/tabs/VariablesTab'

const TABS = [
  { value: 'secrets', label: 'Secrets' },
  { value: 'variables', label: 'Variables' },
]

export const ConfigPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'secrets'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <Stack gap="md">
            <ListPageHeader title="Config" description="Runtime variables and secrets configuration" />
            <SegmentedControl size="xs" value={tab} onChange={handleTabChange} data={TABS} />
          </Stack>
        }
        emptyPanelMessage="Select an item to view its details"
      >
        {tab === 'variables' ? <VariablesTab /> : <SecretsTab />}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
