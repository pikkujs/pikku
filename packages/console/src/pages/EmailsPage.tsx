import React from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Mail } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { EmailsComposePanel } from '../components/emails/EmailsComposePanel'
import { EmailDetailCards, emailName } from '../components/emails/EmailsCards'
import { useEmailsCompose } from '../hooks/useEmailsCompose'
import type { EmailsCompose } from '../hooks/useEmailsCompose'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useSearchParams } from '../router'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { EmailsOverview } from './EmailsOverview'

const EMAIL_DOCS_HREF = 'https://pikku.dev/docs'

export interface EmailsPageProps {
  hero?: React.ReactNode
  headerRight?: React.ReactNode
  /** Compose state owned by the host (see `useEmailsCompose`). Supplying it
   *  means the host mounts `EmailsComposePanel` itself, so this drops its own
   *  form column and gives the preview the full width. */
  compose?: EmailsCompose
}

export const EmailsPage: React.FC<EmailsPageProps> = ({
  hero,
  headerRight,
  compose: hostCompose,
}) => {
  useLocale()
  const { meta } = usePikkuMeta()
  const [, setSearchParams] = useSearchParams()
  const src = meta.emailsMeta?.src || undefined

  const ownCompose = useEmailsCompose({ enabled: !hostCompose })
  const compose = hostCompose ?? ownCompose
  const {
    templateNames,
    selectedTemplate,
    selectedMeta,
    selectedLocale,
    loading,
  } = compose

  if (loading) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={<ListPageHeader title={m.emails_page_title()} />}
        >
          <ConsoleLoading />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  if (templateNames.length === 0) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout
          hidePanel
          header={<ListPageHeader title={m.emails_page_title()} />}
        >
          <EmptyStatePlaceholder
            icon={Mail}
            hero={hero}
            title={m.emails_no_templates_title()}
            description={m.emails_no_templates_description()}
            code="pikku emails generate"
            docsHref={EMAIL_DOCS_HREF}
          />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  if (!selectedTemplate || !selectedMeta || !selectedLocale) {
    return (
      <ConsoleSurface>
        <EmailsOverview compose={compose} src={src} headerRight={headerRight} />
      </ConsoleSurface>
    )
  }

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        hidePanel
        surface="cards"
        sidePanel={
          hostCompose ? undefined : <EmailsComposePanel compose={compose} />
        }
        sidePanelWidth={300}
        sidePanelLabel={m.emails_template_details()}
        header={
          <ListPageHeader
            title={m.emails_page_title()}
            item={emailName(selectedTemplate)}
            onTitle={() => setSearchParams({})}
            filters={headerRight}
          />
        }
      >
        <CardsPage>
          <EmailDetailCards compose={compose} src={src} />
        </CardsPage>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
