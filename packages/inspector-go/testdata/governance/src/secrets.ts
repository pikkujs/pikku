import type { Hooks } from '#pikku/workflow'
import { a, b as c } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { boot } from '#pikku/pikku-bootstrap.gen.js'
import * as ns from '#pikku/rpc'
export { x, y as z } from '#pikku/rpc'
import def from '#pikku/default'

declare const secrets: any
declare const key: string

export const go = async () => {
  await secrets.getSecret('STRIPE_KEY')
  await secrets.hasSecret(`TEMPLATE_KEY`)
  await secrets.getSecret(key)
  await secrets.getSecret()
  await secrets.getSecrets(['A', key, 'B'])
  await secrets.getSecrets(keys)
  await secrets.getSecrets()
  secrets.getSecret('STRIPE_KEY')
}
declare const keys: string[]
