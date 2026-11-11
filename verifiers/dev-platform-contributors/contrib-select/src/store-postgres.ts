import type { Contributor } from '@pikku/core/contributors'

const store = (target: string): Contributor => ({
  provides: ['store'],
  when: (platform) => platform.db?.engine === 'postgres',
  run: (services, _env, _runtime, platform) => {
    services.store = {
      engine: 'postgres',
      target,
      coercionTables: Object.keys(platform.db?.coercionMap ?? {}),
    }
  },
})

export const storePostgresDev = store('dev')
export const storePostgresDeploy = store('deploy')
