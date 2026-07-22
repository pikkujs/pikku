import { useState } from 'react'
import { Button, SegmentedControl } from '@pikku/mantine/core'
import { Plus } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { RolesTab } from '../components/scopes/RolesTab'
import { ScopesVocabularyTab } from '../components/scopes/ScopesVocabularyTab'
import type { EditableRole } from '../components/scopes/RoleEditorDrawer'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'

type Tab = 'roles' | 'scopes'

export const ScopesPage: React.FC = () => {
  useLocale()
  const [tab, setTab] = useState<Tab>('roles')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EditableRole | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openRole = (role: EditableRole | null) => {
    setEditing(role)
    setDrawerOpen(true)
  }

  const changeTab = (next: Tab) => {
    setTab(next)
    setSearch('')
  }

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
          docsHref="https://pikku.dev/docs/core-features/permission-guards"
          lead={
            tab === 'roles' ? (
              <Button
                size="xs"
                leftSection={<Plus size={14} />}
                onClick={() => openRole(null)}
              >
                {m.scopes_create_role()}
              </Button>
            ) : undefined
          }
          filters={
            <SegmentedControl
              size="sm"
              value={tab}
              onChange={(v) => changeTab(v as Tab)}
              data={[
                { label: m.scopes_tab_roles() as string, value: 'roles' },
                { label: m.scopes_tab_scopes() as string, value: 'scopes' },
              ]}
            />
          }
          search={{
            placeholder:
              tab === 'roles'
                ? m.scopes_search_roles()
                : m.scopes_search_scopes(),
            value: search,
            onChange: setSearch,
            width: 240,
          }}
        />
      }
    >
      {tab === 'roles' ? (
        <RolesTab
          search={search}
          editing={editing}
          drawerOpen={drawerOpen}
          onOpenRole={openRole}
          onCloseDrawer={() => setDrawerOpen(false)}
        />
      ) : (
        <ScopesVocabularyTab search={search} />
      )}
    </PageContainer>
  )
}
