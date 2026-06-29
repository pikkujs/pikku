import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { ListPageHeader } from '../components/layout/PageLayout'
import { Stack } from '@pikku/mantine/core'
import { useI18n } from '@pikku/react/i18n'

export const AuditPage: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  const { t } = useI18n()
  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <ListPageHeader
        title={t('audit.title')}
        description={t('audit.description')}
        docsHref="https://pikku.dev/docs"
      />
      <EmptyStatePlaceholder
        icon={ShieldCheck}
        hero={emptyHero}
        title={t('audit.empty_title')}
        description={t('audit.empty_description')}
        docsHref="https://pikku.dev/docs"
      />
    </Stack>
  )
}
