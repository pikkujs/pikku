import {
  addCatalogEmail as addFromCatalog,
  type AddCatalogEmailResult,
} from '@pikku/code-edit/emails'
import {
  BadRequestError,
  LocalEnvironmentOnlyError,
  NotFoundError,
} from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const addCatalogEmail = pikkuFunc<
  { name: string; force?: boolean },
  AddCatalogEmailResult
>({
  title: 'Add Catalogue Email',
  description:
    "Copies a ready-made email into the project's email templates and merges its copy into the base locale, keeping files and keys that already exist unless forced.",
  expose: true,
  scopes: ['pikku:console:emails:write'],
  func: async ({ metaService, codeEditService }, { name, force }) => {
    if (!codeEditService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    const emailsMeta = await metaService.getEmailMeta()
    if (!emailsMeta.src) {
      throw new NotFoundError(
        'No generated email metadata found. Run `pikku emails init`.'
      )
    }
    try {
      return addFromCatalog(emailsMeta.src, name, { force })
    } catch (error) {
      throw new BadRequestError(
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})
