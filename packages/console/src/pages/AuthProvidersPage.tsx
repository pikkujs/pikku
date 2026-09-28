import React, { useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
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
            title={m.authproviders_title()}
            description={m.authproviders_page_description()}
            docsHref="https://better-auth.com/docs/concepts/oauth"
            search={{
              placeholder: m.authproviders_search_placeholder(),
              value: searchQuery,
              onChange: setSearchQuery,
              width: 240,
            }}
          />
        }
        emptyPanelMessage={m.auth_providers_select_provider()}
        surface="cards"
      >
        <AuthProvidersListPanel externalSearch={searchQuery} />
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
