import { EMAIL_CATALOG, type EmailCatalogEntry } from '@pikku/code-edit/emails'
import { pikkuFunc } from '#pikku/addon/function'

export const getEmailCatalog = pikkuFunc<null, { emails: EmailCatalogEntry[] }>(
  {
    title: 'Get Email Catalogue',
    description:
      'Lists the ready-made transactional emails (invitation, magic link, password reset, receipt, welcome) with their files, locale copy, data fields and how to send each.',
    expose: true,
    scopes: ['pikku:console:emails:read'],
    func: async () => ({ emails: EMAIL_CATALOG }),
  }
)
