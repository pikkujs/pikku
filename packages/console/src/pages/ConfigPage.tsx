import React from 'react'
import { useSearchParams } from '../router'
import { Stack, SegmentedControl } from '@pikku/mantine/core'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SecretsTab } from '../components/tabs/SecretsTab'
import { VariablesTab } from '../components/tabs/VariablesTab'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const TABS = [
  { value: 'secrets', label: 'Secrets' },
  { value: 'variables', label: 'Variables' },
]

export const ConfigPage: React.FC = () => {
  useLocale()
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
            <ListPageHeader
              title={m.config_title()}
              description={m.config_description()}
            />
            <SegmentedControl
              size="xs"
              value={tab}
              onChange={handleTabChange}
              data={TABS}
            />
          </Stack>
        }
        emptyPanelMessage={m.common_select_item()}
      >
        {tab === 'variables' ? <VariablesTab /> : <SecretsTab />}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
