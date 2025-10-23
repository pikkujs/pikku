/**
 * Query Optimization
 *
 * This example shows patterns for writing efficient queries with proper
 * indexing, single-query optimizations, and avoiding common performance pitfalls.
 */

import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { NotFoundError } from '@pikku/core/errors'
import type {
  Ingredient,
  Dish,
  Order,
} from '@pikku-workspace-starter/sdk/.generated/database-types-pure.js'

// ============================================================================
// Single Query Optimization - Update with NotFoundError
// ============================================================================

// ✅ Good - Single atomic update
export const cancelOrder = pikkuFunc<{ orderId: string }, Order>({
  func: async ({ kysely }, { orderId }) => {
    return await kysely
      .updateTable('order')
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where('orderId', '=', orderId)
      .returningAll()
      .executeTakeFirstOrThrow(() => new NotFoundError('Order not found'))
  },
  docs: {
    summary: 'Cancel order',
    tags: ['orders'],
    errors: ['NotFoundError'],
  },
})

// ❌ Avoid - Separate read and update
/*
export const badCancelOrder = pikkuFunc<{ orderId: string }, Order>({
  func: async ({ kysely }, { orderId }) => {
    // Extra query! And race condition between reads/writes
    const order = await kysely
      .selectFrom('order')
      .select(['orderId'])
      .where('orderId', '=', orderId)
      .executeTakeFirst()

    if (!order) throw new NotFoundError('Order not found')

    return await kysely
      .updateTable('order')
      .set({ status: 'cancelled' })
      .where('orderId', '=', orderId)
      .returningAll()
      .executeTakeFirstOrThrow()
  }
})
*/

// ============================================================================
// Use returningAll() Instead of Manual Column Listing
// ============================================================================

export const updateDish = pikkuFunc<
  { dishId: string; name: string; price: number },
  Dish
>({
  func: async ({ kysely }, { dishId, name, price }) => {
    return await kysely
      .updateTable('dish')
      .set({ name, price, updatedAt: new Date() })
      .where('dishId', '=', dishId)
      .returningAll() // ✅ Clean and type-safe
      .executeTakeFirstOrThrow(() => new NotFoundError('Dish not found'))
  },
  docs: {
    summary: 'Update dish',
    tags: ['dishes'],
    errors: ['NotFoundError'],
  },
})

// ❌ Avoid - Manual column listing
/*
.returning([
  'dishId', 'name', 'description', 'price', 'isAvailable',
  'createdAt', 'updatedAt'  // Easy to miss columns or typo!
])
*/

// ============================================================================
// Delete Operations - Return void with executeTakeFirstOrThrow
// ============================================================================

export const deleteDish = pikkuFunc<{ dishId: string }, void>({
  func: async ({ kysely, eventHub }, { dishId }) => {
    await kysely
      .deleteFrom('dish')
      .where('dishId', '=', dishId)
      .executeTakeFirstOrThrow(() => new NotFoundError('Dish not found'))

    await eventHub?.publish('dishes.deleted', null, { dishId })
    // No return - either succeeds or throws
  },
  docs: {
    summary: 'Delete dish',
    tags: ['dishes'],
    errors: ['NotFoundError'],
  },
})

// ❌ Avoid - Manual row count checking and unnecessary return values
/*
export const badDeleteDish = pikkuFunc<{ dishId: string }, { deleted: boolean }>({
  func: async ({ kysely }, { dishId }) => {
    const result = await kysely
      .deleteFrom('dish')
      .where('dishId', '=', dishId)
      .executeTakeFirst()

    if (result.numDeletedRows === BigInt(0)) {
      throw new NotFoundError('Dish not found')
    }

    return { deleted: true }  // Unnecessary!
  }
})
*/

// ============================================================================
// Using Indexes Effectively
// ============================================================================

export const getLowStockIngredients = pikkuFunc<
  { threshold?: number },
  Ingredient[]
>({
  func: async ({ kysely }, { threshold = 10 }) => {
    return await kysely
      .selectFrom('ingredient')
      .selectAll()
      .where('quantityAvailable', '<=', threshold)
      .orderBy('quantityAvailable', 'asc')
      .orderBy('name', 'asc') // Secondary sort for consistent ordering
      .execute()
  },
  docs: {
    summary: 'Get low stock ingredients',
    description: 'Returns ingredients below threshold (default 10)',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Efficient Joins and Aggregations
// ============================================================================

type DishWithAvailability = Dish & {
  canPrepare: boolean
}

export const getDishesWithAvailability = pikkuFunc<
  void,
  DishWithAvailability[]
>({
  func: async ({ kysely }) => {
    return await kysely
      .selectFrom('dish')
      .leftJoin('dishIngredient', 'dishIngredient.dishId', 'dish.dishId')
      .leftJoin(
        'ingredient',
        'ingredient.ingredientId',
        'dishIngredient.ingredientId'
      )
      .select([
        'dish.dishId',
        'dish.name',
        'dish.description',
        'dish.price',
        'dish.isAvailable',
        'dish.createdAt',
        'dish.updatedAt',
        // Check if all ingredients are available
        (eb) =>
          eb
            .case()
            .when(
              eb.fn.min('ingredient.quantityAvailable'),
              '>=',
              eb.fn.min('dishIngredient.quantityNeeded')
            )
            .then(true)
            .else(false)
            .end()
            .as('canPrepare'),
      ])
      .where('dish.isAvailable', '=', true)
      .groupBy([
        'dish.dishId',
        'dish.name',
        'dish.description',
        'dish.price',
        'dish.isAvailable',
        'dish.createdAt',
        'dish.updatedAt',
      ])
      .execute()
  },
  docs: {
    summary: 'Get dishes with availability check',
    description: 'Checks if dish can be prepared based on ingredient stock',
    tags: ['dishes'],
  },
})

// ============================================================================
// Pagination with Proper Ordering
// ============================================================================

export const getOrdersPaginated = pikkuFunc<
  { limit?: number; offset?: number },
  Order[]
>({
  func: async ({ kysely }, { limit = 20, offset = 0 }) => {
    return await kysely
      .selectFrom('order')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .orderBy('orderId', 'desc') // Tie-breaker for consistent pagination
      .limit(limit)
      .offset(offset)
      .execute()
  },
  docs: {
    summary: 'Get orders with pagination',
    tags: ['orders'],
  },
})

// ============================================================================
// Conditional Filtering
// ============================================================================

export const searchIngredients = pikkuFunc<
  { nameFilter?: string; minStock?: number; maxStock?: number },
  Ingredient[]
>({
  func: async ({ kysely }, { nameFilter, minStock, maxStock }) => {
    let query = kysely.selectFrom('ingredient').selectAll()

    if (nameFilter) {
      query = query.where('name', 'ilike', `%${nameFilter}%`)
    }

    if (minStock !== undefined) {
      query = query.where('quantityAvailable', '>=', minStock)
    }

    if (maxStock !== undefined) {
      query = query.where('quantityAvailable', '<=', maxStock)
    }

    return await query.orderBy('name', 'asc').execute()
  },
  docs: {
    summary: 'Search ingredients with filters',
    tags: ['ingredients'],
  },
})

// ============================================================================
// ANTI-PATTERNS (DON'T DO THIS)
// ============================================================================

// ❌ Avoid: N+1 query problem
/*
export const badGetOrdersWithItems = pikkuFunc<void, any[]>({
  func: async ({ kysely }) => {
    const orders = await kysely
      .selectFrom('order')
      .selectAll()
      .execute()

    // DON'T DO THIS - makes N queries!
    for (const order of orders) {
      order.items = await kysely
        .selectFrom('orderItem')
        .selectAll()
        .where('orderId', '=', order.orderId)
        .execute()
    }

    return orders
  }
})
*/

// ❌ Avoid: Over-fetching data
/*
export const badGetOrders = pikkuFunc<void, Order[]>({
  func: async ({ kysely }) => {
    // Fetching ALL orders without limit - bad for large tables!
    return await kysely
      .selectFrom('order')
      .selectAll()
      .execute()
  }
})
*/

// ❌ Avoid: Selecting unnecessary columns
/*
export const badGetOrderSummary = pikkuFunc<void, any[]>({
  func: async ({ kysely }) => {
    // Don't fetch all columns if you only need a few!
    return await kysely
      .selectFrom('order')
      .selectAll()  // Fetches everything including large text fields
      .execute()

    // Better: select only what you need
    // .select(['orderId', 'status', 'totalAmount', 'createdAt'])
  }
})
*/
