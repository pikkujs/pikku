import { defineScope } from '@pikku/core/scope'
import { defineVirtualUsers } from '@pikku/core/virtual-user'

export const genScopes = defineScope({ admin: { displayName: 'Admin' }, orders: { description: 'dup root' } })
export const genUsers = defineVirtualUsers({ gen: { name: 'Generated' } })
