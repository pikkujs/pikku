import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { JsxPropValue } from '../services/design.service.js'

export const updateJsxProp = pikkuFunc<
  { path: string; line: number; col: number; propName: string; propValue: JsxPropValue | null },
  { ok: true }
>({
  title: 'Update JSX Prop',
  description:
    'Sets one literal prop on the JSX element at a source location; null removes it.',
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ designService }, { path, line, col, propName, propValue }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    await designService.writeJsxProp(path, line, col, propName, propValue)
    return { ok: true as const }
  },
})
