/**
 * Wires the addon and reaches its functions over RPC.
 *
 * The `wireAddon` declaration is what `pikku db generate` reads to decide whose
 * schemas belong in this project's migrations — the addon is discovered because
 * it is wired, not because it happens to be in `package.json`. An addon reached
 * through `wireRemoteAddon` runs against another host's database and would
 * contribute nothing here.
 */
import { pikkuSessionlessFunc } from '#pikku/function'
import { wireAddon } from '#pikku/addon'
import { wireHTTP } from '#pikku/http'

// The grant names the secret the app's better-auth scaffold declares in
// auth-secrets.gen.ts — a file the first inspection of a clean checkout runs
// before it exists, and must not report the grant as targeting nothing (PKU124).
wireAddon({
  name: 'labels',
  package: '@pikku/verifier-db-addon',
  secretGrants: ['BETTER_AUTH_SECRET'],
})

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
