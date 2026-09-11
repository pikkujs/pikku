import { useState } from 'react'
import { Button } from '@pikku/mantine/core'
import { Plus } from 'lucide-react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { RolesList } from '../components/scopes/RolesList'
import type { EditableRole } from '../components/scopes/RoleEditorPanel'
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
      header={
        <ListPageHeader
          title={m.roles_page_title()}
          description={m.roles_page_desc()}
          docsHref="https://pikku.dev/docs/core-features/permission-guards"
          lead={
            <Button
              size="xs"
              leftSection={<Plus size={14} />}
              onClick={() => openRole(null)}
              data-testid="scopes-create-role"
            >
              {m.scopes_create_role()}
            </Button>
          }
          search={{
            placeholder: m.scopes_search_roles(),
            value: search,
            onChange: setSearch,
            width: 240,
          }}
        />
      }
    >
      <RolesList
        search={search}
        editing={editing}
        panelOpen={panelOpen}
        onOpenRole={openRole}
        onClosePanel={() => setPanelOpen(false)}
      />
    </PageContainer>
  )
}
