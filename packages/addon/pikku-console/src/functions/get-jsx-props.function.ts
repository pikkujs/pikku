import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { JsxPropValue } from '../services/design.service.js'

export const getJsxProps = pikkuFunc<
  { path: string; line: number; col: number },
  { props: Record<string, JsxPropValue> }
>({
  title: 'Get JSX Props',
  description:
    'Reads the literal props of the JSX element at a source location, as stamped on a previewed element.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }, { path, line, col }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return { props: await designService.readJsxProps(path, line, col) }
  },
})
