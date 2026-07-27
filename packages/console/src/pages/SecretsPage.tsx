import React, { useState } from 'react'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { SecretsListPanel } from '../components/secrets/SecretsListPanel'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const SecretsPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.secrets_title()}
            description={m.secrets_description()}
            docsHref="https://pikku.dev/docs/core-features/secrets"
            filters={
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  placeholder={m.secrets_search_placeholder()}
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
        emptyPanelMessage={m.secrets_select_item()}
      >
        <SecretsListPanel searchQuery={searchQuery} emptyHero={emptyHero} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
