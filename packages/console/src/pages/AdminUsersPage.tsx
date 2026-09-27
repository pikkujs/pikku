import { useState } from 'react'
import { Button, Code, Text, ThemeIcon } from '@pikku/mantine/core'
import { RotateCw, UserPlus, Users } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { UsersDirectoryPanel } from '../components/users/UsersDirectoryPanel'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { ForDevelopers } from '../components/ui/ForDevelopers'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useUserAdmin } from '../context/UserAdminContext'
import {
  describeUsersError,
  isUserAdminMissing,
  useAdminUsers,
} from '../hooks/useAdminUsers'

export const AdminUsersPage: React.FC = () => {
  useLocale()
  const { can } = useUserAdmin()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const { usersQuery } = useAdminUsers(search)
  const error = usersQuery.error
  const missing = isUserAdminMissing(error)

  return (
    <PageContainer
      header={
        <ListPageHeader
          title={m.users_title()}
          description={m.users_page_description()}
          docsHref="https://pikku.dev/docs/core-features/permission-guards"
          search={
            !error
              ? {
                  placeholder: m.users_search_placeholder(),
                  value: search,
                  onChange: setSearch,
                  width: 240,
                }
              : undefined
          }
        />
      }
    >
      <CardsPage>
        {error ? (
          <>
            <SectionCard
              title={
                missing ? m.users_missing_title() : m.users_load_failed_title()
              }
              blurb={
                missing ? m.users_missing_blurb() : m.users_load_failed_blurb()
              }
              right={
                missing ? (
                  <ThemeIcon variant="light" color="gray" size={44} radius="md">
                    <Users size={22} />
                  </ThemeIcon>
                ) : (
                  <Button
                    variant="default"
                    leftSection={<RotateCw size={14} />}
                    loading={usersQuery.isFetching}
                    onClick={() => void usersQuery.refetch()}
                  >
                    {m.users_retry()}
                  </Button>
                )
              }
              testId={missing ? 'users-missing' : 'users-load-failed'}
            />
            <ForDevelopers label={m.users_dev_label()} testId="users-dev">
              {missing && <Text size="sm">{m.users_missing_dev_body()}</Text>}
              <Code block>{asI18n(describeUsersError(error))}</Code>
            </ForDevelopers>
          </>
        ) : (
          <UsersDirectoryPanel
            search={search}
            creating={creating}
            onCreatingChange={setCreating}
            action={
              can('admin:users:create') ? (
                <Button
                  size="lg"
                  leftSection={<UserPlus size={16} />}
                  onClick={() => setCreating(true)}
                  data-testid="create-user"
                >
                  {m.users_create_action()}
                </Button>
              ) : undefined
            }
          />
        )}
      </CardsPage>
    </PageContainer>
  )
}
