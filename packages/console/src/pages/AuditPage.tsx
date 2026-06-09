import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { ListPageHeader } from '../components/layout/PageLayout'
import { Stack } from '@mantine/core'

export const AuditPage: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <ListPageHeader
        title="Audit"
        description="Activity log and audit trail for this stage"
        docsHref="https://pikku.dev/docs"
      />
      <EmptyStatePlaceholder
        icon={ShieldCheck}
        hero={emptyHero}
        title="No audit events yet"
        description="Activity and changes to this stage will appear here."
        docsHref="https://pikku.dev/docs"
      />
    </Stack>
  )
}
