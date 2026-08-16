/**
 * Wires the addon and reaches its functions over RPC.
 *
 * The `wireAddon` declaration is what `pikku db generate` reads to decide whose
 * schemas belong in this project's migrations — the addon is discovered because
 * it is wired, not because it happens to be in `package.json`. An addon reached
 * through `wireRemoteAddon` runs against another host's database and would
 * contribute nothing here.
 */
import { pikkuSessionlessFunc, wireAddon } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

wireAddon({ name: 'labels', package: '@pikku/verifier-db-addon' })

export const roundTripLabel = pikkuSessionlessFunc<
  { id: string; name: string },
  Array<{ id: string; name: string; color: string | null }>
>({
  func: async (_, data, { rpc }) => {
    await rpc.invoke('labels:addLabel', data)
    return await rpc.invoke('labels:listLabels')
  },
})

wireHTTP({
  route: '/round-trip-label',
  method: 'post',
  auth: false,
  func: roundTripLabel,
})
