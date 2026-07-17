import { pikkuFunc } from '#pikku'

export type DeclaredScopeEntry = {
  id: string
  description?: string
  /**
   * False for a scope still in the store but no longer declared in code. It
   * authorizes nothing — no function can require it — and is awaiting
   * `pikku scopes prune`.
   */
  declared: boolean
}

export const scopeListDeclared = pikkuFunc<
  null,
  { scopes: DeclaredScopeEntry[] }
>({
  title: 'List Declared Scopes',
  description:
    'Lists the scope vocabulary a role can be composed from, flagging any that are no longer declared in code.',
  expose: true,
  scopes: ['pikku:scopes:read'],
  func: async ({ scopeService }) => {
    if (!scopeService) {
      return { scopes: [] }
    }

    const scopes = await scopeService.listScopes()
    return { scopes: scopes.sort((a, b) => a.id.localeCompare(b.id)) }
  },
})
