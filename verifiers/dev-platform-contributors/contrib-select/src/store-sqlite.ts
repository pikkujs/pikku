import type { Contributor } from '@pikku/core/contributors'

const store = (target: string): Contributor => ({
  provides: ['store'],
  when: (platform) => platform.db?.engine === 'sqlite',
  run: (services, _env, _runtime, platform) => {
    services.store = {
      engine: 'sqlite',
      target,
      coercionTables: Object.keys(platform.db?.coercionMap ?? {}),
    }
  },
})

export const storeSqliteDev = store('dev')
export const storeSqliteDeploy = store('deploy')
