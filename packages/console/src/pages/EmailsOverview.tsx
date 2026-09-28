import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { EmailsOverviewCards } from '../components/emails/EmailsCards'
import type { EmailsCompose } from '../hooks/useEmailsCompose'

export type EmailsOverviewProps = {
  compose: EmailsCompose
  src?: string
  headerRight?: React.ReactNode
}

export const EmailsOverview: React.FC<EmailsOverviewProps> = ({
  compose,
  src,
  headerRight,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ResizablePanelLayout
      hidePanel
      surface="cards"
      header={
        <ListPageHeader
          title={m.emails_page_title()}
          filters={
            <Group gap="sm" wrap="nowrap" miw={0}>
              <TextInput
                data-testid="page-search"
                placeholder={m.emails_search_emails()}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                w={240}
                maw="100%"
              />
              {headerRight}
            </Group>
          }
        />
      }
    >
      <CardsPage>
        <EmailsOverviewCards
          compose={compose}
          src={src}
          searchQuery={searchQuery}
        />
      </CardsPage>
    </ResizablePanelLayout>
  )
}
