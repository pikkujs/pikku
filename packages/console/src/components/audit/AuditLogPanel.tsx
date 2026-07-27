import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'

export interface AuditLogPanelProps {
  emptyHero?: React.ReactNode
}

/**
 * The audit log body. There is no OSS audit trail yet, so it is the empty
 * state — hosts pass their own hero to point at whatever they offer instead.
 */
export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ emptyHero }) => {
  useLocale()
  return (
    <EmptyStatePlaceholder
      icon={ShieldCheck}
      hero={emptyHero}
      title={m.audit_empty_title()}
      description={m.audit_empty_description()}
      docsHref="https://pikku.dev/docs"
    />
  )
}
