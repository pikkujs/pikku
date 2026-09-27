import type { Role, ScopeService } from '@pikku/core/services'
import type { FlatScope } from '@pikku/core/scope'

/**
 * A ScopeService stub, present only because declaring a scope makes one
 * required — the flags here need declared scope ids for their `anyOf`.
 *
 * Nothing in this verifier reads it: the runner checks `scopes:` against the
 * session, and the capability half of a flag is resolved from the same place.
 * The scope lifecycle a store must honour is the scopes verifier's subject, and
 * a second thin copy of it here would only rot.
 */
export class UnusedScopeService implements ScopeService {
  private scopes = new Map<string, FlatScope & { declared: boolean }>()

  async syncScopes(scopes: FlatScope[]) {
    for (const scope of scopes) {
      this.scopes.set(scope.id, { ...scope, declared: true })
    }
  }
  async listScopes() {
    return [...this.scopes.values()]
  }
  async resolveScopes() {
    return []
  }
  async syncSystemRoles() {}
  async createRole(_role: Role) {}
  async deleteRole() {}
  async setRoleScopes() {}
  async listRoles() {
    return []
  }
  async addUserToRole() {}
  async removeUserFromRole() {}
  async listUserRoles() {
    return []
  }
  async listRolesForUsers(userIds: string[]) {
    const byUser: Record<string, string[]> = {}
    for (const userId of userIds) {
      byUser[userId] = []
    }
    return byUser
  }
  async addScopeToUser() {}
  async removeScopeFromUser() {}
  async listUserScopes() {
    return []
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
