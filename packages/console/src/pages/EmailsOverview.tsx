import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { EmailTemplateListPanel } from '../components/emails/EmailTemplateListPanel'

const EMAIL_DOCS_HREF = 'https://pikku.dev/docs'

export type EmailsOverviewProps = {
  templateNames: string[]
  templates: Record<string, any>
  onSelect: (templateName: string) => void
  headerRight?: React.ReactNode
}

export const EmailsOverview: React.FC<EmailsOverviewProps> = ({
  templateNames,
  templates,
  onSelect,
  headerRight,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <ResizablePanelLayout
      hidePanel
      header={
        <ListPageHeader
          title={m.emails_title()}
          description={m.emails_description()}
          docsHref={EMAIL_DOCS_HREF}
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={m.emails_search_placeholder()}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
              {headerRight}
            </Group>
          }
        />
      }
    >
      <EmailTemplateListPanel
        templateNames={templateNames}
        templates={templates}
        onSelect={onSelect}
        searchQuery={searchQuery}
      />
    </ResizablePanelLayout>
  )
}
