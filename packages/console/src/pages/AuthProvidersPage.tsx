import React, { useState } from 'react'
import { TextInput } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Search } from 'lucide-react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { AuthProvidersListPanel } from '../components/auth/AuthProvidersListPanel'

export {
  AUTH_PROVIDERS,
  type AuthProviderDef,
  type AuthProviderField,
} from '../components/auth/auth-providers-catalog'

export const AuthProvidersPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  useLocale()

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.auth_providers_title()}
            description={m.auth_providers_description()}
            docsHref="https://www.better-auth.com/docs/concepts/oauth"
            filters={
              <TextInput
                placeholder={m.auth_providers_search_placeholder()}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
            }
          />
        }
        emptyPanelMessage={m.auth_providers_select_provider()}
      >
        <AuthProvidersListPanel externalSearch={searchQuery} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
