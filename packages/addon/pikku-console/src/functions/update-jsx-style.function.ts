import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const updateJsxStyle = pikkuFunc<
  { path: string; line: number; col: number; styles: Record<string, string | null> },
  { ok: true }
>({
  title: 'Update JSX Style',
  description:
    'Sets CSS properties on the JSX element at a source location, as important Tailwind arbitrary-property classes on its className, so every place it renders changes; null clears one.',
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ designService }, { path, line, col, styles }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    await designService.writeJsxStyle(path, line, col, styles)
    return { ok: true as const }
  },
})
