import { m } from './i18n/messages'
import { m as _m } from '../i18n/messages.js'
export const A = () => <div title={m.title()}>{_m['sub_key']()} {m.greeting({ name: 'x' })}</div>
const key = 'dyn'
export const dyn = m[key]
export const d1 = (({ one, 'two': t, ...rest }) => 1)(m)
const { three, four: renamed, ...others } = m
const { [key]: computedName } = m
export const asValue = [m]
type T = typeof m.typed_key
export function shadow(m: any) { return m.not_counted }
export function block() { { const m = 1; return m.x } }
export function loops() { for (const m of []) { m.y } for (let m = 0;;) { m.z } }
export function caught() { try {} catch (m) { m.w } }
export function inner() { function m() {} return m.q }
export function used() { return m.after_shadow_scope }
switch (1) { case 1: const m = 2; m.sw }
