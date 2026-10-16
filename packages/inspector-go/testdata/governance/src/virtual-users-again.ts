import { defineVirtualUsers } from '@pikku/core/virtual-user'

export const more = defineVirtualUsers({ zed: { name: 'Zed' } })
export const inline = defineVirtualUsers(someVar)

declare const someVar: Record<string, unknown>
