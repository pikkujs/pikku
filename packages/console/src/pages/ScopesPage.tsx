import { useState } from 'react'
import { SegmentedControl } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { RolesTab } from '../components/scopes/RolesTab'
import { ScopesVocabularyTab } from '../components/scopes/ScopesVocabularyTab'
import { useLocale } from '@/i18n/config'

type Tab = 'roles' | 'scopes'

export const ScopesPage: React.FC = () => {
  useLocale()
  const [tab, setTab] = useState<Tab>('roles')

  return (
    <PageContainer
      header={
        <ListPageHeader
          title={asI18n('Scopes')}
          description={asI18n(
            tab === 'roles'
              ? 'Roles composed from the declared scope vocabulary.'
              : 'The scope vocabulary, declared in code via wireScope.'
          )}
          docsHref="https://pikku.dev/docs/authentication/scopes"
          filters={
            <SegmentedControl
              size="sm"
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              data={[
                { label: asI18n('Roles') as string, value: 'roles' },
                { label: asI18n('Scopes') as string, value: 'scopes' },
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
