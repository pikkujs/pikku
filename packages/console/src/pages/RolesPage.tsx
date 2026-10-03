import { useState } from 'react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { RolesList } from '../components/scopes/RolesList'
import type { EditableRole } from '../components/scopes/RoleEditorPanel'
import { CardsPage } from '../components/ui/CardsPage'
import { useLocale } from '@/i18n/config'
import { m } from '@/i18n/messages'

export const RolesPage: React.FC = () => {
  useLocale()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EditableRole | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const openRole = (role: EditableRole | null) => {
    setEditing(role)
    setPanelOpen(true)
  }

  return (
    <PageContainer
      data-testid="roles-page"
      surface="cards"
      header={
        <ListPageHeader
          title={m.roles_page_title()}
          description={m.roles_page_desc_plain()}
          docsHref="https://pikku.dev/docs/core-features/permission-guards"
          search={{
            placeholder: m.scopes_search_roles(),
            value: search,
            onChange: setSearch,
            width: 240,
          }}
        />
      }
    >
      <CardsPage>
        <RolesList
          search={search}
          editing={editing}
          panelOpen={panelOpen}
          onOpenRole={openRole}
          onClosePanel={() => setPanelOpen(false)}
        />
      </CardsPage>
    </PageContainer>
  )
}
