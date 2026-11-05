import { pikkuFunc, pikkuSessionlessFunc } from './core.js'
import type { Pii, Private, Secret } from './core.js'

declare const secret: Secret<string>
declare const pii: Pii<string>
declare const priv: Private<string>

interface Base {
  inherited: Pii<string>
  overridden: string
}
interface Row extends Base {
  own: Private<string>
  overridden: string
}
declare const row: Row

export const returnsSecret = pikkuFunc(async () => ({ token: secret }))
export const returnsBareSecret = pikkuFunc(async () => secret)
export const sessionedPrivate = pikkuFunc(async () => ({
  email: pii,
  name: priv,
}))
export const sessionlessPrivate = pikkuSessionlessFunc(async () => ({
  name: priv,
}))
export const sessionlessPii = pikkuSessionlessFunc(async () => ({ email: pii }))
export const sessionlessBoth = pikkuSessionlessFunc(async () => ({
  z: { deep: { deeper: pii } },
  a: [priv],
  m: {} as Record<string, Secret<string>>,
}))
export const sessionlessInherited = pikkuSessionlessFunc(async () => row)
export const sessionlessSync = pikkuSessionlessFunc(() => [row])
export const sessionlessUnion = pikkuSessionlessFunc(async () =>
  Math.random() > 0.5 ? { a: pii } : null
)
export const clean = pikkuSessionlessFunc(async () => ({
  ok: true,
  __hidden: pii,
}))
