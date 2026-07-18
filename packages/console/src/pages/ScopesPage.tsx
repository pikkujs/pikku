import { useState } from 'react'
import { SegmentedControl } from '@pikku/mantine/core'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { RolesTab } from '../components/scopes/RolesTab'
import { ScopesVocabularyTab } from '../components/scopes/ScopesVocabularyTab'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'

type Tab = 'roles' | 'scopes'

export const ScopesPage: React.FC = () => {
  useLocale()
  const [tab, setTab] = useState<Tab>('roles')

  return (
    <PageContainer
      header={
        <ListPageHeader
          title={m.scopes_page_title()}
          description={
            tab === 'roles'
              ? m.scopes_page_desc_roles()
              : m.scopes_page_desc_vocab()
          }
          docsHref="https://pikku.dev/docs/authentication/scopes"
          filters={
            <SegmentedControl
              size="sm"
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              data={[
                { label: m.scopes_tab_roles() as string, value: 'roles' },
                { label: m.scopes_tab_scopes() as string, value: 'scopes' },
              ]}
            />
          }
        />
      }
    >
      {tab === 'roles' ? <RolesTab /> : <ScopesVocabularyTab />}
    </PageContainer>
  )
}
