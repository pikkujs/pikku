import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
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
          search={{
            placeholder: m.emails_search_emails(),
            value: searchQuery,
            onChange: setSearchQuery,
            width: 240,
          }}
          filters={headerRight}
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
