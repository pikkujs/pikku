/**
 * Joined Queries with jsonBuildObject
 *
 * This example shows how to properly handle joins with type safety using jsonBuildObject
 * and lateral joins.
 */

import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { jsonBuildObject } from 'kysely/helpers/postgres'
import type {
  Order,
  User,
} from '@pikku-workspace-starter/sdk/.generated/database-types-pure.js'

// ============================================================================
// Simple Inner Join with jsonBuildObject
// ============================================================================

type OrderWithClient = Order & {
  client: Pick<User, 'name' | 'role'>
}

export const getPendingOrders = pikkuFunc<void, OrderWithClient[]>({
  func: async ({ kysely }) => {
    return await kysely
      .selectFrom('order')
      .innerJoin('user as client', 'client.userId', 'order.clientId')
      .selectAll('order')
      .select((eb) =>
        jsonBuildObject({
          name: eb.ref('client.name'),
          role: eb.ref('client.role'),
        }).as('client')
      )
      .where('order.status', '=', 'pending')
      .execute()
  },
  docs: {
    summary: 'Get pending orders with client info',
    tags: ['orders'],
  },
})

// ============================================================================
// Optional Relationships with Case Statements
// ============================================================================

type OrderWithOptionalCook = Order & {
  client: Pick<User, 'name' | 'role'>
  cook: Pick<User, 'name' | 'role'> | null
}

export const getAllOrders = pikkuFunc<void, OrderWithOptionalCook[]>({
  func: async ({ kysely }) => {
    return await kysely
      .selectFrom('order')
      .innerJoin('user as client', 'client.userId', 'order.clientId')
      .leftJoin('user as cook', 'cook.userId', 'order.cookId')
      .selectAll('order')
      .select((eb) => [
        jsonBuildObject({
          name: eb.ref('client.name'),
          role: eb.ref('client.role'),
        }).as('client'),
        eb
          .case()
          .when(eb.ref('cook.name'), 'is not', null)
          .then(
            jsonBuildObject({
              name: eb.ref('cook.name'),
              role: eb.ref('cook.role'),
            })
          )
          .else(null)
          .end()
          .as('cook'),
      ])
      .execute()
  },
  docs: {
    summary: 'Get all orders with client and optional cook',
    tags: ['orders'],
  },
})

// ============================================================================
// Lateral Joins for Optional Relationships (RECOMMENDED)
// ============================================================================

type OrderWithLateralCook = Order & {
  cook: Pick<User, 'name' | 'role'> | null
}

export const getMyOrders = pikkuFunc<void, OrderWithLateralCook[]>({
  func: async ({ kysely }, _data, session) => {
    return await kysely
      .selectFrom('order')
      .leftJoinLateral(
        (qb) =>
          qb
            .selectFrom('user as u')
            .whereRef('u.userId', '=', 'order.cookId')
            .select((eb) =>
              jsonBuildObject({
                name: eb.ref('u.name'),
                role: eb.ref('u.role'),
              }).as('cook')
            )
            .as('cj'),
        (join) => join.onTrue()
      )
      .selectAll('order')
      .select('cj.cook')
      .where('order.clientId', '=', session.userId)
      .orderBy('order.createdAt', 'desc')
      .execute()
  },
  docs: {
    summary: 'Get user orders with optional cook (lateral join)',
    tags: ['orders'],
  },
})

// ============================================================================
// Multiple Lateral Joins (Required and Optional)
// ============================================================================

type OrderWithDetails = Order & {
  client: Pick<User, 'name' | 'role'>
  cook: Pick<User, 'name' | 'role'> | null
}

export const getOrder = pikkuFunc<{ orderId: string }, OrderWithDetails>({
  func: async ({ kysely }, { orderId }) => {
    return await kysely
      .selectFrom('order')
      .innerJoinLateral(
        (qb) =>
          qb
            .selectFrom('user as client')
            .whereRef('client.userId', '=', 'order.clientId')
            .select((eb) =>
              jsonBuildObject({
                name: eb.ref('client.name'),
                role: eb.ref('client.role'),
              }).as('client')
            )
            .as('clientJoin'),
        (join) => join.onTrue()
      )
      .leftJoinLateral(
        (qb) =>
          qb
            .selectFrom('user as cook')
            .whereRef('cook.userId', '=', 'order.cookId')
            .select((eb) =>
              jsonBuildObject({
                name: eb.ref('cook.name'),
                role: eb.ref('cook.role'),
              }).as('cook')
            )
            .as('cookJoin'),
        (join) => join.onTrue()
      )
      .selectAll('order')
      .select(['clientJoin.client', 'cookJoin.cook'])
      .where('order.orderId', '=', orderId)
      .executeTakeFirstOrThrow(() => new NotFoundError('Order not found'))
  },
  docs: {
    summary: 'Get order with full details',
    tags: ['orders'],
    errors: ['NotFoundError'],
  },
})

// ============================================================================
// ANTI-PATTERNS (DON'T DO THIS)
// ============================================================================

// ❌ Avoid: Regular joins with case statements (nullable field issues)
/*
export const getBadExample = pikkuFunc<void, any[]>({
  func: async ({ kysely }) => {
    return await kysely
      .selectFrom('order')
      .leftJoin('user as cook', 'cook.userId', 'order.cookId')
      .select((eb) =>
        eb.case()
          .when(eb('cook.name', 'is not', null))
          .then(jsonBuildObject({ name: eb.ref('cook.name'), role: eb.ref('cook.role') }))
          .else(null)
          .end()
          .as('cook')
      )
      .execute()
  }
})
*/

// ❌ Avoid: Manual mapping after query execution
/*
export const getAnotherBadExample = pikkuFunc<void, any[]>({
  func: async ({ kysely }) => {
    const results = await kysely
      .selectFrom('order')
      .leftJoin('user as cook', 'cook.userId', 'order.cookId')
      .select(['cook.name as cookName', 'cook.role as cookRole'])
      .execute()

    return results.map(order => ({
      ...order,
      cook: order.cookName ? { name: order.cookName, role: order.cookRole } : null
    }))
  }
})
*/
