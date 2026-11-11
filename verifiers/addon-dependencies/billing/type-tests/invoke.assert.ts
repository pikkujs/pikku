import type { TypedPikkuRPC } from '../.pikku/addon/rpc/pikku-rpc-wirings-map.internal.gen.js'

declare const rpc: TypedPikkuRPC

export const invokesStripeByAlias = async (): Promise<number> => {
  const out = await rpc.invoke('stripe:charge', { amountCents: 5 })
  const chargeId: string = out.chargeId
  const cents: number = out.chargedCents

  // @ts-expect-error amountCents is a number in stripe's SDK
  await rpc.invoke('stripe:charge', { amountCents: 'five' })
  // @ts-expect-error stripe's charge returns no such field
  void out.refundId
  // @ts-expect-error stripe's SDK has no such function
  await rpc.invoke('stripe:refund', { chargeId })
  // @ts-expect-error only the declared alias is typed, not the package name
  await rpc.invoke('@pikku/verifiers-addon-deps-stripe:charge', {
    amountCents: 5,
  })

  return cents
}
