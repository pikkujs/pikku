import type { Role, ScopeService } from '@pikku/core/services'
import type { FlatScope } from '@pikku/core/scope'

/**
 * The smallest ScopeService that satisfies the generated
 * `RequiredSingletonServices`. The verifier exercises the compile-time
 * narrowing and the `verifyScopes` gate, neither of which reads a store, so
 * this only has to hold what it is given — a real deployment wires
 * `KyselyScopeService`.
 */
export class InMemoryScopeService implements ScopeService {
  private scopes: FlatScope[] = []
  private roles = new Map<string, Role>()
  private userRoles = new Map<string, Set<string>>()
  private userScopes = new Map<string, Set<string>>()

  async syncScopes(scopes: FlatScope[]) {
    this.scopes = scopes
  }

  async listScopes() {
    return this.scopes.map((scope) => ({ ...scope, declared: true }))
  }

  async resolveScopes(userId: string) {
    const resolved = new Set(this.userScopes.get(userId) ?? [])
    for (const name of this.userRoles.get(userId) ?? []) {
      for (const scope of this.roles.get(name)?.scopes ?? []) {
        resolved.add(scope)
      }
    }
    return [...resolved]
  }

  async syncSystemRoles(roles: Array<{ name: string; scopes: string[] }>) {
    for (const role of roles) {
      this.roles.set(role.name, { ...role, system: true, declared: true })
    }
  }

  async createRole(role: Role) {
    this.roles.set(role.name, role)
  }

  async deleteRole(name: string) {
    this.roles.delete(name)
  }

  async setRoleScopes(name: string, scopes: string[]) {
    const role = this.roles.get(name)
    if (role) {
      this.roles.set(name, { ...role, scopes })
    }
  }

  async listRoles() {
    return [...this.roles.values()]
  }

  async addUserToRole(userId: string, role: string) {
    const held = this.userRoles.get(userId) ?? new Set()
    held.add(role)
    this.userRoles.set(userId, held)
  }

  async removeUserFromRole(userId: string, role: string) {
    this.userRoles.get(userId)?.delete(role)
  }

  async listUserRoles(userId: string) {
    return [...(this.userRoles.get(userId) ?? [])]
  }

  async addScopeToUser(userId: string, scope: string) {
    const held = this.userScopes.get(userId) ?? new Set()
    held.add(scope)
    this.userScopes.set(userId, held)
  }

  async removeScopeFromUser(userId: string, scope: string) {
    this.userScopes.get(userId)?.delete(scope)
  }

  async listUserScopes(userId: string) {
    return [...(this.userScopes.get(userId) ?? [])]
  }

  async findStaleScopes() {
    return []
  }

  async pruneScopes() {
    return []
  }

  async findStaleSystemRoles() {
    return []
  }

  async pruneSystemRoles() {
    return []
  }
}
