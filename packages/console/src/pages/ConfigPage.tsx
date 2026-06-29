import React from 'react'
import { useSearchParams } from '../router'
import { Stack, SegmentedControl } from '@pikku/mantine/core'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SecretsTab } from '../components/tabs/SecretsTab'
import { VariablesTab } from '../components/tabs/VariablesTab'
import { useI18n } from '@pikku/react/i18n'

const TABS = [
  { value: 'secrets', label: 'Secrets' },
  { value: 'variables', label: 'Variables' },
]

export const ConfigPage: React.FC = () => {
  const { t } = useI18n()
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
            <ListPageHeader title={t('config.title')} description={t('config.description')} />
            <SegmentedControl size="xs" value={tab} onChange={handleTabChange} data={TABS} />
          </Stack>
        }
        emptyPanelMessage={t('common.select_item')}
      >
        {tab === 'variables' ? <VariablesTab /> : <SecretsTab />}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
