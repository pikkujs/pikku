import {
  SystemRoleImmutableError,
  SystemRoleShadowedError,
} from '@pikku/core/errors'
import type { Role, ScopeService } from '@pikku/core/services'
import type { FlatScope } from '@pikku/core/scope'

/**
 * An in-memory ScopeService that satisfies the generated
 * `RequiredSingletonServices`, so the verifier can exercise the compile-time
 * narrowing and the `verifyScopes` gate without a database.
 *
 * It keeps the parts of the contract a store cannot opt out of — additive
 * syncs that mark a removed declaration rather than deleting it, and the
 * system-role mutation rules — because a double that answers `[]` to every
 * stale query would let a regression in those pass the verifier.
 * `KyselyScopeService` is what a real deployment wires.
 */
export class InMemoryScopeService implements ScopeService {
  private scopes = new Map<string, FlatScope & { declared: boolean }>()
  private roles = new Map<string, Role>()
  private userRoles = new Map<string, Set<string>>()
  private userScopes = new Map<string, Set<string>>()

  async syncScopes(scopes: FlatScope[]) {
    const declared = new Set(scopes.map((scope) => scope.id))
    for (const [id, scope] of this.scopes) {
      if (!declared.has(id)) {
        this.scopes.set(id, { ...scope, declared: false })
      }
    }
    for (const scope of scopes) {
      this.scopes.set(scope.id, { ...scope, declared: true })
    }
  }

  async listScopes() {
    return [...this.scopes.values()]
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
    const declared = new Set(roles.map((role) => role.name))
    for (const [name, role] of this.roles) {
      if (role.system && !declared.has(name)) {
        this.roles.set(name, { ...role, declared: false })
      }
    }
    for (const role of roles) {
      this.roles.set(role.name, { ...role, system: true, declared: true })
    }
  }

  async createRole(role: Role) {
    if (this.isSystemRole(role.name)) {
      throw new SystemRoleShadowedError(role.name)
    }
    this.roles.set(role.name, role)
  }

  async deleteRole(name: string) {
    if (this.isSystemRole(name)) {
      throw new SystemRoleImmutableError(name, 'delete')
    }
    this.roles.delete(name)
  }

  async setRoleScopes(name: string, scopes: string[]) {
    if (this.isSystemRole(name)) {
      throw new SystemRoleImmutableError(name, 're-scope')
    }
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
    return [...this.scopes.values()]
      .filter((scope) => !scope.declared)
      .map((scope) => ({
        scope: scope.id,
        roles: [...this.roles.values()]
          .filter((role) => role.scopes.includes(scope.id))
          .map((role) => role.name),
      }))
  }

  async pruneScopes() {
    const stale = await this.findStaleScopes()
    for (const { scope, roles } of stale) {
      this.scopes.delete(scope)
      for (const name of roles) {
        const role = this.roles.get(name)
        if (role) {
          this.roles.set(name, {
            ...role,
            scopes: role.scopes.filter((held) => held !== scope),
          })
        }
      }
      for (const held of this.userScopes.values()) {
        held.delete(scope)
      }
    }
    return stale.map(({ scope }) => scope)
  }

  async findStaleSystemRoles() {
    return [...this.roles.values()]
      .filter((role) => role.system && role.declared === false)
      .map((role) => ({
        role: role.name,
        users: [...this.userRoles.values()].filter((held) =>
          held.has(role.name)
        ).length,
      }))
  }

  async pruneSystemRoles() {
    const stale = await this.findStaleSystemRoles()
    for (const { role } of stale) {
      this.roles.delete(role)
      for (const held of this.userRoles.values()) {
        held.delete(role)
      }
    }
    return stale.map(({ role }) => role)
  }

  /**
   * Asked of the store rather than of the generated `SYSTEM_ROLES`, matching
   * `KyselyScopeService`: a role whose declaration was deleted is still
   * immutable until someone prunes it.
   */
  private isSystemRole(name: string): boolean {
    return this.roles.get(name)?.system === true
  }
}
