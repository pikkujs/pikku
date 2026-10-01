import type { AppPage } from '@pikku/code-edit/routes'
import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const getPages = pikkuFunc<
  { app?: string } | null,
  { pages: AppPage[] }
>({
  title: 'Get Pages',
  description:
    "Lists every frontend's pages from its TanStack Router route files: the app, the route path, the file that defines it and its params.",
  expose: true,
  scopes: ['pikku:console:pages:read'],
  func: async ({ pagesService }, input) => {
    if (!pagesService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return {
      pages: await pagesService.list(input?.app ? [input.app] : undefined),
    }
  },
})
