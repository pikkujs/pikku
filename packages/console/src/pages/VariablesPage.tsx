import React, { useState } from 'react'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { VariablesListPanel } from '../components/variables/VariablesListPanel'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const VariablesPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.variables_title()}
            description={m.variables_description()}
            docsHref="https://pikku.dev/docs/core-features/variables"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder={m.variables_search_placeholder()}
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
              </Group>
            }
          />
        }
        emptyPanelMessage={m.variables_select_item()}
      >
        <VariablesListPanel searchQuery={searchQuery} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
