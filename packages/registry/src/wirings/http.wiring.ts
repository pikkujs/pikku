import { pikkuSessionlessFunc, wireHTTPRoutes } from '#pikku/pikku-types.gen.js'
import { listPackages } from '../functions/list-packages.function.js'
import { getPackage } from '../functions/get-package.function.js'

wireHTTPRoutes({
  auth: false,
  routes: {
    ingest: {
      route: '/api/ingest',
      method: 'post',
      func: pikkuSessionlessFunc<
        { packageName: string; version?: string },
        unknown
      >(async (services, input) => {
        return await services.registryService.ingest(
          input.packageName,
          input.version
        )
      }),
    },
    ingestLocal: {
      route: '/api/ingest-local',
      method: 'post',
      auth: false,
      func: pikkuSessionlessFunc<{ packageDir: string }, unknown>(
        async (services, input) => {
          return await services.registryService.ingestLocal(input.packageDir)
        }
      ),
    },
    icon: {
      route: '/api/icon/:id',
      method: 'get',
      func: pikkuSessionlessFunc<{ id: string }, string | null>(
        async (services, { id }) => {
          return await services.registryService.getPackageIcon(id)
        }
      ),
    },
    listPackages: {
      route: '/api/packages',
      method: 'get',
      func: listPackages,
    },
    getPackage: {
      route: '/api/packages/:id',
      method: 'get',
      func: getPackage,
    },
  },
})
