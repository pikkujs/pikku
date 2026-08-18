import { LocalEnvironmentOnlyError, NotFoundError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const updateEmailTemplate = pikkuFunc<
  {
    templateName: string
    source: string
  },
  { success: boolean }
>({
  title: 'Update Email Template',
  description:
    'Overwrites an email template HTML source file (templates/<name>.html) so small edits can be made from the console.',
  expose: true,
  scopes: ['pikku:console:emails:write'],
  func: async ({ metaService, codeEditService }, { templateName, source }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    const emailsMeta = await metaService.getEmailMeta()
    if (!emailsMeta.src) {
      throw new NotFoundError(
        'No generated email metadata found. Run `pikku emails generate`.'
      )
    }
    if (!emailsMeta.templates[templateName]) {
      throw new NotFoundError(`Unknown email template: ${templateName}`)
    }
    await codeEditService.updateEmailTemplate(
      emailsMeta.src,
      templateName,
      source
    )
    return { success: true }
  },
})
