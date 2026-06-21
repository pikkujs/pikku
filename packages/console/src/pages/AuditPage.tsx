import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { ListPageHeader } from '../components/layout/PageLayout'
import { Stack } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export const AuditPage: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  useLocale()
  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <ListPageHeader
        title={m.audit_title()}
        description={m.audit_description()}
        docsHref="https://pikku.dev/docs"
      />
      <EmptyStatePlaceholder
        icon={ShieldCheck}
        hero={emptyHero}
        title={m.audit_empty_title()}
        description={m.audit_empty_description()}
        docsHref="https://pikku.dev/docs"
      />
    </Stack>
  )
}
