import { pikkuSessionlessFunc, wireHTTPRoutes } from '#pikku/pikku-types.gen.js'
import { listPackages } from '../functions/list-packages.function.js'
import { getPackage } from '../functions/get-package.function.js'

wireHTTPRoutes({
  auth: false,
  routes: {
    ingestOptions: {
      route: '/api/ingest',
      method: 'options',
      func: pikkuSessionlessFunc(async () => void 0),
    },
    ingest: {
      route: '/api/ingest',
      method: 'post',
      auth: true,
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
    ingestLocalOptions: {
      route: '/api/ingest-local',
      method: 'options',
      func: pikkuSessionlessFunc(async () => void 0),
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
    iconOptions: {
      route: '/api/icon/:id',
      method: 'options',
      func: pikkuSessionlessFunc<{ id: string }>(async () => void 0),
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
    listPackagesOptions: {
      route: '/api/packages',
      method: 'options',
      func: pikkuSessionlessFunc(async () => void 0),
    },
    listPackages: {
      route: '/api/packages',
      method: 'get',
      func: listPackages,
    },
    getPackageOptions: {
      route: '/api/packages/:id',
      method: 'options',
      func: pikkuSessionlessFunc<{ id: string }>(async () => void 0),
    },
    getPackage: {
      route: '/api/packages/:id',
      method: 'get',
      func: getPackage,
    },
  },
})
