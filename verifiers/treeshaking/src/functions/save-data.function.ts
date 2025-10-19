import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'

export const saveData = pikkuFunc<{ key: string; value: any }, void>({
  func: async ({ storage }, data) => {
    await storage.save(data.key, data.value)
  },
})
